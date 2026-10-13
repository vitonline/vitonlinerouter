docker stop vitonlinerouter
docker rm vitonlinerouter
docker build -t vitonlinerouter .
docker run -d --name vitonlinerouter -p 20128:20128 --env-file .env -v vitonlinerouter-data:/app/data vitonlinerouter
