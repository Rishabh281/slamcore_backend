docker compose down
docker compose build --no-cache
docker compose up -d
docker logs -f slamcore_backend