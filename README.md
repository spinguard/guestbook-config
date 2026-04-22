# Guestbook

IBM Guestbook v1 — multi-tier app running on VKS, reconciled by Flux.

## Architecture

```text
Browser → guestbook-v1 (3000) → redis-master (6379)
                               → redis-slave  (6379, x2)
```

- **Frontend**: `ibmcom/guestbook:v1` — Go HTTP server on port 3000
- **Redis master**: handles all writes
- **Redis slaves**: handle reads (2 replicas)
- **Service**: LoadBalancer on port 3000

## Directory Structure

```text
.
├── apps/
│   └── guestbook/          # Kustomize base — all app manifests
├── clusters/
│   └── dev/
│       └── guestbook.yaml  # Flux GitRepository + Kustomization CRs
└── tests/
    └── k6/
        └── guestbook.js    # Two-scenario load test (writers + readers)
```

## Deploying with Flux

1. Push this repo to GitHub and update the `url` in `clusters/dev/guestbook.yaml`.
2. Apply the Flux resources to the `dev` VKS cluster:

```bash
kubectl apply -f clusters/dev/guestbook.yaml
```

Flux will reconcile `apps/guestbook/` every 5 minutes (`prune: true` removes deleted resources).

## Deploying Manually

```bash
kubectl apply -k apps/guestbook/
```

## Getting the Guestbook URL

```bash
kubectl get svc guestbook -n guestbook
# Copy the EXTERNAL-IP, then open http://<EXTERNAL-IP>:3000
```

## API Endpoints

| Method | Path                          | Description                     |
|--------|-------------------------------|---------------------------------|
| `GET`  | `/lrange/guestbook`           | Retrieve all entries            |
| `GET`  | `/rpush/guestbook/<message>`  | Add a new entry                 |

## Running k6 Tests

```bash
# Get the LoadBalancer IP first
export BASE_URL=http://$(kubectl get svc guestbook -n guestbook -o jsonpath='{.status.loadBalancer.ingress[0].ip}'):3000

# If the LoadBalancer is not set, use port forward where running k6s
# Separate terminal window
kubectl port-forward deploy/guestbook-v1 -n guestbook 3000:3000

# First terminal window
export BASE_URL="http://localhost:3000"

# Run both scenarios (writers + readers) with defaults
k6 run -e BASE_URL=$BASE_URL tests/k6/guestbook.js

# Customise VU counts and duration
k6 run \
  -e BASE_URL=$BASE_URL \
  -e WRITER_VUS=5 \
  -e READER_VUS=20 \
  -e DURATION=2m \
  tests/k6/guestbook.js
```

## Attribution

This project is a derivative work of the
[IBM Guestbook](https://github.com/IBM/guestbook) sample application,
copyright IBM Corporation, licensed under the
[Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).

The Kubernetes manifests in `apps/guestbook/` are adapted from the IBM
Guestbook v1 source at `v1/` in that repository. Container images
(`ibmcom/guestbook:v1`, `ibmcom/guestbook-redis-slave:v2`) are published
by IBM and consumed unmodified.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text.
