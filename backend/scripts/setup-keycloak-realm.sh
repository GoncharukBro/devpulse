#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# Создание realm internalApi и клиента api2api в Keycloak
# через Admin REST API.
#
# Использование:
#   bash scripts/setup-keycloak-realm.sh
#
# Переменные можно переопределить через окружение:
#   KEYCLOAK_URL, KEYCLOAK_ADMIN, KEYCLOAK_ADMIN_PASSWORD,
#   INTERNAL_REALM, INTERNAL_CLIENT_ID, INTERNAL_CLIENT_SECRET
# ──────────────────────────────────────────────────────────

set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8083}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

INTERNAL_REALM="${KEYCLOAK_INTERNAL_REALM:-internalApi}"
INTERNAL_CLIENT_ID="${KEYCLOAK_INTERNAL_CLIENT_ID:-api2api}"
INTERNAL_CLIENT_SECRET="${KEYCLOAK_INTERNAL_CLIENT_SECRET:-api2api-secret}"

echo "=== Настройка Keycloak: realm '$INTERNAL_REALM' ==="
echo "    URL: $KEYCLOAK_URL"
echo ""

# ── 1. Получить admin-токен ──────────────────────────────
echo "1) Получение admin-токена..."
TOKEN_RESPONSE=$(curl -s -X POST \
  "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  -d "username=$KEYCLOAK_ADMIN" \
  -d "password=$KEYCLOAK_ADMIN_PASSWORD")

ADMIN_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"access_token":"[^"]*"' | sed 's/"access_token":"//;s/"$//')

if [ -z "$ADMIN_TOKEN" ]; then
  echo "ОШИБКА: Не удалось получить admin-токен."
  echo "  Проверьте: Keycloak запущен? Логин/пароль admin верны?"
  echo "  Ответ: $TOKEN_RESPONSE"
  exit 1
fi

echo "   ✓ Admin-токен получен"
echo ""

# ── 2. Создать realm ────────────────────────────────────
echo "2) Создание realm '$INTERNAL_REALM'..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$KEYCLOAK_URL/admin/realms" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"realm\": \"$INTERNAL_REALM\",
    \"enabled\": true
  }")

case "$HTTP_CODE" in
  201) echo "   ✓ Realm '$INTERNAL_REALM' создан" ;;
  409) echo "   → Realm '$INTERNAL_REALM' уже существует (пропускаем)" ;;
  *)   echo "   ОШИБКА: HTTP $HTTP_CODE при создании realm"; exit 1 ;;
esac
echo ""

# ── 3. Создать клиента ──────────────────────────────────
echo "3) Создание клиента '$INTERNAL_CLIENT_ID' в realm '$INTERNAL_REALM'..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$KEYCLOAK_URL/admin/realms/$INTERNAL_REALM/clients" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"clientId\": \"$INTERNAL_CLIENT_ID\",
    \"enabled\": true,
    \"protocol\": \"openid-connect\",
    \"clientAuthenticatorType\": \"client-secret\",
    \"secret\": \"$INTERNAL_CLIENT_SECRET\",
    \"serviceAccountsEnabled\": true,
    \"standardFlowEnabled\": false,
    \"directAccessGrantsEnabled\": false,
    \"publicClient\": false
  }")

case "$HTTP_CODE" in
  201) echo "   ✓ Клиент '$INTERNAL_CLIENT_ID' создан" ;;
  409) echo "   → Клиент '$INTERNAL_CLIENT_ID' уже существует (пропускаем)" ;;
  *)   echo "   ОШИБКА: HTTP $HTTP_CODE при создании клиента"; exit 1 ;;
esac
echo ""

# ── 4. Проверка: получить токен через client_credentials ─
echo "4) Проверка: получение токена через client_credentials..."
TEST_RESPONSE=$(curl -s -X POST \
  "$KEYCLOAK_URL/realms/$INTERNAL_REALM/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=$INTERNAL_CLIENT_ID" \
  -d "client_secret=$INTERNAL_CLIENT_SECRET")

if echo "$TEST_RESPONSE" | grep -q '"access_token"'; then
  echo "   ✓ Токен успешно получен! client_credentials flow работает."
else
  echo "   ОШИБКА: Не удалось получить токен."
  echo "   Ответ: $TEST_RESPONSE"
  exit 1
fi

echo ""
echo "=== Готово! ==="
echo ""
echo "Переменные для .env бэкенда:"
echo "  KEYCLOAK_INTERNAL_REALM=$INTERNAL_REALM"
echo "  KEYCLOAK_INTERNAL_CLIENT_ID=$INTERNAL_CLIENT_ID"
echo "  KEYCLOAK_INTERNAL_CLIENT_SECRET=$INTERNAL_CLIENT_SECRET"
echo ""
echo "Перезапустите бэкенд, чтобы ошибка 'Realm does not exist' исчезла."
