#!/usr/bin/env bash

set -Eeuo pipefail

# -----------------------------
# web-smoke-check.sh
# -----------------------------
# Quick smoke checks for static/dynamic web deployments.
#
# Features:
# - Configurable base URL, timeout, retries, and user-agent
# - Checks multiple paths for HTTP status and optional content match
# - Optional API endpoint checks with expected status
# - Optional static asset checks
# - Colored output and summary table
# - Non-zero exit code on failures
#
# Example:
#   ./scripts/web-smoke-check.sh \
#     --base-url "https://example.com" \
#     --path "/" \
#     --path "/jobs.html::Jobs" \
#     --api "/api/subscribe:200" \
#     --asset "/css/style.css" \
#     --asset "/js/app.js"

SCRIPT_NAME="$(basename "$0")"

BASE_URL=""
TIMEOUT=12
CONNECT_TIMEOUT=5
RETRIES=1
RETRY_DELAY=1
USER_AGENT="web-smoke-check/1.0"
INSECURE_TLS=0
FOLLOW_REDIRECTS=1
VERBOSE=0

# Path checks: "path::needle"
PATH_CHECKS=()
# API checks: "path:status"
API_CHECKS=()
# Asset checks: "/css/style.css"
ASSET_CHECKS=()

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0

print_help() {
  cat <<USAGE
Usage: $SCRIPT_NAME --base-url <url> [options]

Required:
  --base-url <url>              Base URL, e.g. https://careerpakistan.com

Path checks:
  --path <path>                 Check path returns 2xx/3xx, e.g. /jobs.html
  --path <path::needle>         Also require response body contains 'needle'

API checks:
  --api <path:status>           Check API path with expected status, e.g. /api/subscribe:200

Asset checks:
  --asset <path>                Check static file URL returns 200, e.g. /css/style.css

Optional:
  --timeout <seconds>           Total request timeout (default: $TIMEOUT)
  --connect-timeout <seconds>   Connect timeout (default: $CONNECT_TIMEOUT)
  --retries <n>                 Curl retries (default: $RETRIES)
  --retry-delay <seconds>       Delay between retries (default: $RETRY_DELAY)
  --user-agent <ua>             User-Agent value (default: $USER_AGENT)
  --no-follow                   Do not follow redirects
  --insecure                    Allow insecure TLS (-k)
  --verbose                     Print request details
  -h, --help                    Show this help

Exit codes:
  0 -> all checks passed
  1 -> one or more checks failed
  2 -> usage/config error
USAGE
}

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()   { echo -e "${GREEN}[PASS]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_err()  { echo -e "${RED}[FAIL]${NC} $*"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 2
  }
}

trim_trailing_slash() {
  local value="$1"
  value="${value%/}"
  printf '%s' "$value"
}

join_url() {
  local base="$1"
  local path="$2"
  if [[ "$path" != /* ]]; then
    path="/$path"
  fi
  printf '%s%s' "$base" "$path"
}

curl_common_flags() {
  local flags=(
    --silent
    --show-error
    --max-time "$TIMEOUT"
    --connect-timeout "$CONNECT_TIMEOUT"
    --retry "$RETRIES"
    --retry-delay "$RETRY_DELAY"
    --user-agent "$USER_AGENT"
  )

  (( FOLLOW_REDIRECTS == 1 )) && flags+=(--location)
  (( INSECURE_TLS == 1 )) && flags+=(--insecure)

  printf '%s\n' "${flags[@]}"
}

http_status() {
  local url="$1"
  mapfile -t _flags < <(curl_common_flags)
  curl "${_flags[@]}" -o /dev/null -w '%{http_code}' "$url"
}

response_body() {
  local url="$1"
  mapfile -t _flags < <(curl_common_flags)
  curl "${_flags[@]}" "$url"
}

record_pass() { ((PASS_COUNT+=1)); }
record_fail() { ((FAIL_COUNT+=1)); }

check_path() {
  local item="$1"
  local path needle url status body

  if [[ "$item" == *"::"* ]]; then
    path="${item%%::*}"
    needle="${item#*::}"
  else
    path="$item"
    needle=""
  fi

  url="$(join_url "$BASE_URL" "$path")"
  (( VERBOSE == 1 )) && log_info "GET $url"

  if ! status="$(http_status "$url")"; then
    log_err "PATH $path -> request failed"
    record_fail
    return
  fi

  if [[ "$status" =~ ^2|3 ]]; then
    if [[ -n "$needle" ]]; then
      if ! body="$(response_body "$url")"; then
        log_err "PATH $path -> could not fetch body for content check"
        record_fail
        return
      fi
      if grep -Fq -- "$needle" <<<"$body"; then
        log_ok "PATH $path -> HTTP $status, contains '$needle'"
        record_pass
      else
        log_err "PATH $path -> HTTP $status, missing '$needle'"
        record_fail
      fi
    else
      log_ok "PATH $path -> HTTP $status"
      record_pass
    fi
  else
    log_err "PATH $path -> HTTP $status"
    record_fail
  fi
}

check_api() {
  local item="$1"
  local path expected status url

  if [[ "$item" != *":"* ]]; then
    log_err "Invalid --api format: '$item' (expected /path:status)"
    record_fail
    return
  fi

  path="${item%%:*}"
  expected="${item##*:}"

  if [[ ! "$expected" =~ ^[0-9]{3}$ ]]; then
    log_err "Invalid expected status in --api '$item'"
    record_fail
    return
  fi

  url="$(join_url "$BASE_URL" "$path")"
  (( VERBOSE == 1 )) && log_info "GET $url"

  if ! status="$(http_status "$url")"; then
    log_err "API  $path -> request failed"
    record_fail
    return
  fi

  if [[ "$status" == "$expected" ]]; then
    log_ok "API  $path -> HTTP $status"
    record_pass
  else
    log_err "API  $path -> HTTP $status (expected $expected)"
    record_fail
  fi
}

check_asset() {
  local path="$1"
  local status url

  url="$(join_url "$BASE_URL" "$path")"
  (( VERBOSE == 1 )) && log_info "HEAD $url"

  mapfile -t _flags < <(curl_common_flags)
  if ! status="$(curl "${_flags[@]}" --head -o /dev/null -w '%{http_code}' "$url")"; then
    log_err "ASSET $path -> request failed"
    record_fail
    return
  fi

  if [[ "$status" == "200" ]]; then
    log_ok "ASSET $path -> HTTP $status"
    record_pass
  else
    log_err "ASSET $path -> HTTP $status (expected 200)"
    record_fail
  fi
}

# -------- Parse args --------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="${2:-}"
      shift 2
      ;;
    --path)
      PATH_CHECKS+=("${2:-}")
      shift 2
      ;;
    --api)
      API_CHECKS+=("${2:-}")
      shift 2
      ;;
    --asset)
      ASSET_CHECKS+=("${2:-}")
      shift 2
      ;;
    --timeout)
      TIMEOUT="${2:-}"
      shift 2
      ;;
    --connect-timeout)
      CONNECT_TIMEOUT="${2:-}"
      shift 2
      ;;
    --retries)
      RETRIES="${2:-}"
      shift 2
      ;;
    --retry-delay)
      RETRY_DELAY="${2:-}"
      shift 2
      ;;
    --user-agent)
      USER_AGENT="${2:-}"
      shift 2
      ;;
    --no-follow)
      FOLLOW_REDIRECTS=0
      shift
      ;;
    --insecure)
      INSECURE_TLS=1
      shift
      ;;
    --verbose)
      VERBOSE=1
      shift
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_help
      exit 2
      ;;
  esac
done

# -------- Validation --------
require_cmd curl
require_cmd grep

[[ -z "$BASE_URL" ]] && { echo "--base-url is required" >&2; print_help; exit 2; }
BASE_URL="$(trim_trailing_slash "$BASE_URL")"

if [[ ! "$BASE_URL" =~ ^https?:// ]]; then
  echo "--base-url must start with http:// or https://" >&2
  exit 2
fi

if [[ ${#PATH_CHECKS[@]} -eq 0 && ${#API_CHECKS[@]} -eq 0 && ${#ASSET_CHECKS[@]} -eq 0 ]]; then
  log_warn "No checks specified. Adding defaults for this repo."
  PATH_CHECKS=("/" "/jobs.html::Jobs" "/scholarships.html::Scholarships")
  ASSET_CHECKS=("/css/style.css" "/js/app.js")
fi

log_info "Starting smoke checks for: $BASE_URL"

for item in "${PATH_CHECKS[@]}"; do
  check_path "$item"
done

for item in "${API_CHECKS[@]}"; do
  check_api "$item"
done

for item in "${ASSET_CHECKS[@]}"; do
  check_asset "$item"
done

echo
log_info "Completed. Passed: $PASS_COUNT | Failed: $FAIL_COUNT"

if (( FAIL_COUNT > 0 )); then
  exit 1
fi

exit 0
