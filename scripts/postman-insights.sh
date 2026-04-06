#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# repo locations (assume siblings by default)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PARENT_DIR="$(cd "${ROOT_DIR}/.." && pwd)"
# Load .env file if it exists (securely from root dir)
if [ -f "${ROOT_DIR}/.env" ]; then
  set -a  # Auto-export variables
  source "${ROOT_DIR}/.env"
  set +a  # Stop auto-exporting
fi


if [ -z "$POSTMAN_API_KEY" ] || [ -z "$POSTMAN_INSIGHTS_PROJECT_ID" ]; then
  echo "Error: POSTMAN_API_KEY and POSTMAN_INSIGHTS_PROJECT_ID must be set."
  echo "Copy .env.postman.example to .env.postman and add your credentials, or export them."
  exit 1
fi

# Mode selection: exactly one of Discovery Mode, project-based, or workspace+system-env.
# Agent allows only one of: --discovery-mode, --project, or --workspace-id + --system-env.
HAS_WORKSPACE_ENV=
[ -n "$POSTMAN_WORKSPACE_ID" ] && [ -n "$POSTMAN_SYSTEM_ENV_ID" ] && HAS_WORKSPACE_ENV=1

if [ -n "$HAS_WORKSPACE_ENV" ] && [ -n "$POSTMAN_INSIGHTS_CLUSTER_NAME" ] && [ -n "$POSTMAN_INSIGHTS_PROJECT_ID" ]; then
  # All three modes possible — prompt
  if [ -t 0 ]; then
    echo "Multiple agent modes are configured. Choose one:"
    echo ""
    echo "  1) Discovery Mode (recommended for API Catalog)"
    echo "     Service appears in API Catalog → Service Discovery → Postman Insights Catalog."
    echo ""
    echo "  2) Project-based mode"
    echo "     Traffic sent to your Insights project (Diagnostics, etc.)."
    echo ""
    echo "  3) Workspace / Service Graph"
    echo "     Links agent to your workspace and system environment for Dependencies view."
    echo ""
    while true; do
      read -r -p "Choose [1, 2, or 3]: " choice
      case "$choice" in
        1) MODE_FLAG="--discovery-mode --cluster-name $POSTMAN_INSIGHTS_CLUSTER_NAME"; break ;;
        2) MODE_FLAG="--project $POSTMAN_INSIGHTS_PROJECT_ID"; break ;;
        3) MODE_FLAG="--workspace-id $POSTMAN_WORKSPACE_ID --system-env $POSTMAN_SYSTEM_ENV_ID"; break ;;
        *) echo "Enter 1, 2, or 3." ;;
      esac
    done
  else
    MODE_FLAG="--discovery-mode --cluster-name $POSTMAN_INSIGHTS_CLUSTER_NAME"
    echo "Multiple modes set; using Discovery Mode (non-interactive)."
  fi
elif [ -n "$POSTMAN_INSIGHTS_CLUSTER_NAME" ] && [ -n "$POSTMAN_INSIGHTS_PROJECT_ID" ]; then
  # Cluster + project (no workspace/env) — prompt 1 or 2
  if [ -t 0 ]; then
    echo "Both POSTMAN_INSIGHTS_CLUSTER_NAME and POSTMAN_INSIGHTS_PROJECT_ID are set."
    echo ""
    echo "  1) Discovery Mode (recommended for API Catalog)"
    echo "     The service is auto-registered and appears in Postman under:"
    echo "     API Catalog → Service Discovery → Postman Insights Catalog."
    echo ""
    echo "  2) Project-based mode"
    echo "     Traffic is sent to your Insights project by ID."
    echo ""
    while true; do
      read -r -p "Choose [1 or 2]: " choice
      case "$choice" in
        1) MODE_FLAG="--discovery-mode --cluster-name $POSTMAN_INSIGHTS_CLUSTER_NAME"; break ;;
        2) MODE_FLAG="--project $POSTMAN_INSIGHTS_PROJECT_ID"; break ;;
        *) echo "Enter 1 or 2." ;;
      esac
    done
  else
    MODE_FLAG="--discovery-mode --cluster-name $POSTMAN_INSIGHTS_CLUSTER_NAME"
    echo "Both cluster name and project ID set; using Discovery Mode (non-interactive)."
  fi
elif [ -n "$HAS_WORKSPACE_ENV" ] && [ -z "$POSTMAN_INSIGHTS_CLUSTER_NAME" ] && [ -z "$POSTMAN_INSIGHTS_PROJECT_ID" ]; then
  # Only workspace + system env set — use Service Graph mode (project ID still required for script start)
  MODE_FLAG="--workspace-id $POSTMAN_WORKSPACE_ID --system-env $POSTMAN_SYSTEM_ENV_ID"
elif [ -n "$HAS_WORKSPACE_ENV" ]; then
  # Workspace/env set alongside cluster or project — default to Discovery or Project; user can re-run and choose 3
  if [ -n "$POSTMAN_INSIGHTS_CLUSTER_NAME" ]; then
    MODE_FLAG="--discovery-mode --cluster-name $POSTMAN_INSIGHTS_CLUSTER_NAME"
  else
    MODE_FLAG="--project $POSTMAN_INSIGHTS_PROJECT_ID"
  fi
elif [ -n "$POSTMAN_INSIGHTS_CLUSTER_NAME" ]; then
  MODE_FLAG="--discovery-mode --cluster-name $POSTMAN_INSIGHTS_CLUSTER_NAME"
else
  MODE_FLAG="--project $POSTMAN_INSIGHTS_PROJECT_ID"
fi

if ! command -v postman-insights-agent &>/dev/null; then
  echo "Error: postman-insights-agent CLI not found. Install it with:"
  echo '  bash -c "$(curl -L https://releases.observability.postman.com/scripts/install-postman-insights-agent.sh)"'
  exit 1
fi

NAMESPACE="${POSTMAN_INSIGHTS_NAMESPACE}"
DEPLOYMENT="transfers-api"

# Repro mode: default on; set POSTMAN_INSIGHTS_REPRO_MODE=false (or off/0/no) to disable
REPRO_FLAG=""
case "${POSTMAN_INSIGHTS_REPRO_MODE:-true}" in
  [fF]alse|[oO]ff|0|[nN]o) ;;
  *) REPRO_FLAG="--repro-mode" ;;
esac

echo "Injecting Insights Agent into deployment/$DEPLOYMENT in namespace $NAMESPACE..."
kubectl get -n "$NAMESPACE" deployment/"$DEPLOYMENT" -o yaml \
  | POSTMAN_API_KEY="$POSTMAN_API_KEY" postman-insights-agent kube inject $MODE_FLAG $REPRO_FLAG -s=true -f - \
  | kubectl apply -f -

echo "Done. Restart pods if needed: kubectl rollout restart deployment/$DEPLOYMENT -n $NAMESPACE"
echo "Send traffic to the API (e.g. http://localhost:3001 via port-forward); Insights may take 5-8 minutes to show endpoints."
if [[ "$MODE_FLAG" == *--discovery-mode* ]]; then
  echo "For API Catalog: go to Postman → API Catalog → Service Discovery → Postman Insights Catalog → select service and complete onboarding."
fi