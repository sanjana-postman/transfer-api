#!/usr/bin/env bash
# run this script from the root of the repo. It will create a kind cluster, build and load the transfer-api image, and deploy the API + Postman Insights agent.
set -euo pipefail

# repo locations (assume siblings by default)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT_DIR="$(cd "${ROOT_DIR}/.." && pwd)"
# Load .env file if it exists (securely from root dir)
if [ -f "${ROOT_DIR}/.env" ]; then
  set -a  # Auto-export variables
  source "${ROOT_DIR}/.env"
  set +a  # Stop auto-exporting
fi

CLUSTER_NAME="${CLUSTER_NAME:-demo}"

TRANSFER_DIR="${TRANSFER_DIR:-${ROOT_DIR}}"

# required Postman vars
POSTMAN_API_KEY="${POSTMAN_API_KEY:-}"
TRANSFER_PROJECT_ID="${TRANSFER_PROJECT_ID:-}"


if [[ -z "${POSTMAN_API_KEY}" || -z "${TRANSFER_PROJECT_ID}" ]]; then
  echo "ERROR: missing required env vars."
  echo "Required:"
  echo "  POSTMAN_API_KEY"
  echo "  TRANSFER_PROJECT_ID"
  exit 1
fi

# tools
for cmd in kind kubectl docker curl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: missing $cmd"; exit 1; }
done

echo "🔧 Using repos:"
echo "  transfer: ${TRANSFER_DIR}"
echo

#####################################
# 1) Create kind cluster (if needed)
#####################################
if kind get clusters | grep -qx "${CLUSTER_NAME}"; then
  echo "✅ Kind cluster '${CLUSTER_NAME}' already exists"
else
  echo "🐳 Creating kind cluster '${CLUSTER_NAME}'"
  # expects transfer-api/kind-config.yaml (optional). If you don’t have it, remove --config.
  if [[ -f "${TRANSFER_DIR}/kind-config.yaml" ]]; then
    kind create cluster --name "${CLUSTER_NAME}" --config "${TRANSFER_DIR}/kind-config.yaml"
  else
    kind create cluster --name "${CLUSTER_NAME}"
  fi
fi

kind export kubeconfig --name "${CLUSTER_NAME}" >/dev/null 2>&1 || true
kubectl config use-context "kind-${CLUSTER_NAME}" >/dev/null 2>&1 || true

echo "🔎 Cluster check:"
kubectl get nodes

#####################################
# 2) Install ingress-nginx (idempotent)
#####################################
echo "🌐 Ensuring ingress-nginx is installed..."
if kubectl get ns ingress-nginx >/dev/null 2>&1; then
  echo "✅ ingress-nginx namespace exists"
else
  kubectl apply --validate=false -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
fi

echo "⏳ Waiting for ingress-nginx controller..."
kubectl -n ingress-nginx rollout status deployment/ingress-nginx-controller --timeout=240s

#####################################
# 3) Build images + load into kind
#####################################
echo "🏗️  Building docker images..."
docker build -t transfers-api:dev "${TRANSFER_DIR}"


echo "📦 Loading images into kind..."
kind load docker-image transfers-api:dev --name "${CLUSTER_NAME}"

#####################################
# 4) Install Postman Insights Agent DaemonSet
#####################################
echo "🛰️  Installing Postman Insights Agent DaemonSet..."
kubectl apply -f "${TRANSFER_DIR}/k8s/postman-insights-agent-daemonset.yaml"

# For kind: toleration to schedule on control-plane if needed (harmless if already allowed)
kubectl -n postman-insights-namespace-transfer patch daemonset postman-insights-agent --type='merge' -p '{
  "spec": { "template": { "spec": { "tolerations": [
    { "key": "node-role.kubernetes.io/control-plane", "operator": "Exists", "effect": "NoSchedule" },
    { "key": "node-role.kubernetes.io/master", "operator": "Exists", "effect": "NoSchedule" }
  ]}}}}' >/dev/null 2>&1 || true

echo "⏳ Waiting for Insights agent..."
kubectl -n postman-insights-namespace-transfer rollout status daemonset/postman-insights-agent --timeout=240s

#####################################
# 5) Apply service manifests (templated with env vars)
#####################################
tmpdir="$(mktemp -d)"
cleanup() { rm -rf "${tmpdir}"; }
trap cleanup EXIT

render_apply() {
  local in_file="$1"
  local out_file="$2"

  sed \
    -e "s|__POSTMAN_API_KEY__|${POSTMAN_API_KEY}|g" \
    -e "s|__POSTMAN_SYSTEM_ENV__|${POSTMAN_SYSTEM_ENV}|g" \
    -e "s|__TRANSFER_PROJECT_ID__|${TRANSFER_PROJECT_ID}|g" \
    -e "s|__TRANSFER_WORKSPACE_ID__|${TRANSFER_WORKSPACE_ID}|g" \
    "${in_file}" > "${out_file}"

  kubectl apply -f "${out_file}"
}

echo "🚀 Deploying transfer..."
render_apply "${TRANSFER_DIR}/k8s/transfer.yaml" "${tmpdir}/transfer.yaml"
kubectl -n transfers rollout status deployment/transfers-api --timeout=180s

echo "🔗 Applying ingress bridge services + shared ingress..."
#kubectl apply -f "${TRANSFER_DIR}/k8s/ingress.yaml"
#kubectl port-forward -n ingress-nginx service/ingress-nginx-controller 3001:3001
kubectl port-forward -n transfers svc/transfers-api 3001:3001

#####################################
# 6) Health checks through ingress
#####################################
echo "⏳ Waiting briefly for ingress routing..."
sleep 2

echo "🩺 Health checks:"
curl -sS -o /dev/null -w "transfers: %{http_code}\n" http://localhost/health || true

echo
echo "✅ Demo environment is up."
echo "Next:"
echo "  1) ./scripts/simulate-traffic.sh --verbose --slow"
echo "  2) Open Insights projects in Postman and wait ~5-10 min for endpoint inference."