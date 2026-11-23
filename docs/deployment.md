# Deploying Companykeeping on Quip

The repository follows Stillpoint’s single-image layout. Docker builds the Vite client, Maven packages its assets and Flyway migrations into the Spring Boot JAR, and the runtime image runs Java 21 as a non-root user. The Helm chart targets k3s and supports Traefik. The standalone Compose installation runs its own PostgreSQL 17 service.

## Prepare the database and route

Quip’s PostgreSQL 17 service is `trainer-archive-postgres.trainer-archive.svc.cluster.local`. From a staged checkout on Quip, provision and verify the dedicated login, database and namespace. The script creates a `companykeeping-db` Secret on first install and reuses it on subsequent runs. It checks ownership and rejects unexpected privileges. The NetworkPolicy permits TCP 5432 from Companykeeping pods in its own namespace.

```sh
bash deploy/provision-quip-db.sh
sudo -n k3s kubectl apply -f chart/ops/db-access.yaml
```

The PostgreSQL operator owns the data volume. Back up the `companykeeping` database and verify a restore before a schema upgrade.

The public hostname is `companykeeping.martinvolejnik.com`. The `quip` Cloudflare Tunnel routes it to Traefik at `http://localhost:80` and preserves the original Host header. For changes to this shared tunnel, validate all affected hostname rules in a staged configuration and keep a ready second connector active while restarting the primary. Use LAN SSH for the restart and retain the previous configuration for rollback. The chart derives `PUBLIC_ORIGIN` from the ingress hostname.

## Stage and install a revision

From the checkout containing the revision to deploy, stage the committed source on Quip.

```sh
revision=$(git rev-parse HEAD)
ssh quip.martinvolejnik.com "mkdir -p companykeeping-deploy/$revision"
git archive "$revision" | ssh quip.martinvolejnik.com "tar -x -C companykeeping-deploy/$revision"
ssh -t quip.martinvolejnik.com "cd companykeeping-deploy/$revision && exec bash"
```

On Quip, build the ARM64 image, import it into k3s, and install the chart. Flyway applies pending migrations at startup.

```sh
set -euo pipefail
DB_HOST=trainer-archive-postgres.trainer-archive.svc.cluster.local
WEB_HOST=companykeeping.martinvolejnik.com
revision=${PWD##*/}
docker build --platform linux/arm64 -t "companykeeping:$revision" .
docker save "companykeeping:$revision" | sudo -n k3s ctr images import -
sudo -n helm --kubeconfig /etc/rancher/k3s/k3s.yaml upgrade --install companykeeping ./chart \
  --namespace companykeeping --atomic --timeout 10m \
  --set-string "image.tag=$revision" --set-string "database.host=$DB_HOST" \
  --set ingress.enabled=true --set-string "ingress.host=$WEB_HOST"
sudo -n k3s kubectl -n companykeeping rollout status deployment/companykeeping
curl -fsS -H "Host: $WEB_HOST" http://127.0.0.1/healthz
curl -fsS "https://$WEB_HOST/healthz"
```

The health endpoint checks PostgreSQL connectivity. The chart can also refer to a registry image by supplying `image.repository`, `image.digest`, and a suitable `image.pullPolicy`. A Helm rollback restores an application revision. Restore the database from backup when recovery requires an earlier schema.

## Validate without a cluster

```sh
helm lint ./chart --set-string image.tag=check --set-string database.host=postgres.example.test
helm template companykeeping ./chart --namespace companykeeping \
  --set-string image.tag=check --set-string database.host=postgres.example.test \
  --set ingress.enabled=true --set-string ingress.host=companykeeping.example.test
```
