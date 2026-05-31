#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------
# web-smoke-check.sh
# Basic smoke checks for the Career Pakistan website.
#
# Usage:
#   scripts/web-smoke-check.sh [BASE_URL]
#
# Examples:
#   scripts/web-smoke-check.sh
#   scripts/web-smoke-check.sh http://localhost:3000
#   scripts/web-smoke-check.sh https://career-pakistan.vercel.app
# ------------------------------------------------------------

BASE_URL="${1:-${BASE_URL:-http://localhost:3000}}"
CURL_TIMEOUT="${CURL_TIMEOUT:-15}"
CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-5}"

# Core pages/endpoints that should respond with successful/non-error status.
# You can tune this list over time.
ROUTES=(
  "/"
  "/index.html"
  "/jobs.html"
  "/internships.html"
  "/scholarships.html"
  "/exams.html"
  "/blog.html"
  "/search.html"
  "/api/sheets?sheet=Scholarships"
)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass_count=0
warn_count=0
fail_count=0

print_header() {
  echo "=============================================="
  echo " Career Pakistan Web Smoke Check"
  echo " Base URL: ${BASE_URL}"
  echo " Time: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  echo "=============================================="
}

normalize_base_url() {
  # Remove trailing slash to avoid double slashes when concatenating.
  BASE_URL="${BASE_URL%/}"
}

check_dependencies() {
  if ! command -v curl >/dev/null 2>&1; then
    echo -e "${RED}✗ curl is required but not installed.${NC}"
    exit 1
  fi
}

check_route() {
  local route="$1"
  local url="${BASE_URL}${route}"
  local status

  # We intentionally do not use --fail here so we can inspect status codes ourselves.
  status="$(curl -sS -o /dev/null -w "%{http_code}" \
    --max-time "${CURL_TIMEOUT}" \
    --connect-timeout "${CURL_CONNECT_TIMEOUT}" \
    "${url}" || echo "000")"

  if [[ "${status}" =~ ^2[0-9][0-9]$ ]]; then
    echo -e "${GREEN}PASS${NC} ${route} -> HTTP ${status}"
    ((pass_count+=1))
  elif [[ "${status}" =~ ^3[0-9][0-9]$ ]]; then
    echo -e "${YELLOW}WARN${NC} ${route} -> HTTP ${status} (redirect)"
    ((warn_count+=1))
  else
    echo -e "${RED}FAIL${NC} ${route} -> HTTP ${status}"
    ((fail_count+=1))
  fi
}

run_checks() {
  local route
  for route in "${ROUTES[@]}"; do
    check_route "${route}"
  done
}

print_summary() {
  echo "----------------------------------------------"
  echo "Summary:"
  echo "  Passed : ${pass_count}"
  echo "  Warnings: ${warn_count}"
  echo "  Failed : ${fail_count}"
  echo "----------------------------------------------"

  if (( fail_count > 0 )); then
    echo -e "${RED}Smoke check completed with failures.${NC}"
    exit 1
  fi

  if (( warn_count > 0 )); then
    echo -e "${YELLOW}Smoke check completed with warnings.${NC}"
    exit 0
  fi

  echo -e "${GREEN}Smoke check completed successfully.${NC}"
}

main() {
  normalize_base_url
  check_dependencies
  print_header
  run_checks
  print_summary
}

main "$@"
