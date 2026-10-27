#!/usr/bin/env bash
# The REST export contains no credentials, so every account on the copy is locked
# out. This asks a different question: if you can reach the DATABASE rather than
# only the API, can the logins come too?
set -euo pipefail
cd "$(dirname "$0")"

# a backend that was just started is not answering yet
ready() { for _ in $(seq 1 60); do
  curl -sf -o /dev/null -H "X-Parse-Application-Id: $2" "$1/users?limit=0" && return 0; sleep 0.5
done; echo "backend $1 never came up" >&2; return 1; }
ready http://127.0.0.1:1337/parse origin-app
ready http://127.0.0.1:1338/parse destination-app

login() { # username password base -> prints yes/no
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Parse-Application-Id: $3" \
    "$4/login?username=$1&password=$2")
  [ "$code" = 200 ] && echo "yes" || echo "no (HTTP $code)"
}

echo ""
echo "  what the API hands you for a user:"
curl -s -H 'X-Parse-Application-Id: origin-app' -H 'X-Parse-Master-Key: origin-master-key' \
  'http://127.0.0.1:1337/parse/classes/_User?limit=1' | sed 's/^/      /'
echo ""
echo "  what the database row actually holds:"
docker compose exec -T mongo-a mongosh dev --quiet --eval \
  'const u=db.getCollection("_User").findOne({username:"ana"}); print("      fields: "+Object.keys(u).join(", "))'

echo ""
echo "  ana logging in, before carrying the hash:"
echo "      on the original: $(login ana correct-horse-1 origin-app http://127.0.0.1:1337/parse)"
echo "      on the copy:     $(login ana correct-horse-1 destination-app http://127.0.0.1:1338/parse)"

HASH=$(docker compose exec -T mongo-a mongosh dev --quiet --eval \
  'print(db.getCollection("_User").findOne({username:"ana"})._hashed_password)' | tr -d '\r\n')
docker compose exec -T mongo-b mongosh dev --quiet --eval \
  "db.getCollection('_User').updateOne({username:'ana'},{\$set:{_hashed_password:'$HASH'}})" >/dev/null

echo ""
echo "  after writing that one field into the copy's database:"
echo "      on the copy:     $(login ana correct-horse-1 destination-app http://127.0.0.1:1338/parse)"
echo ""
