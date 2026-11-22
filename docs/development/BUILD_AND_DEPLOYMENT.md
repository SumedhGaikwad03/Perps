# Build and Deployment Guide

This document describes production compilation, Dockerization, and deployment architectures for the Perps Trading Platform.

---

## 1. Production Build Protocol

The platform utilizes Turborepo to generate optimized production artifacts:

```bash
# Clean previous build artifacts
rm -rf apps/*/dist apps/*/.next

# Compile all workspaces
bun run build
```

* **Frontend (`apps/web`)**: Vite compiles optimized static assets into `apps/web/dist/`.
* **Backend Services (`apps/backend`, `apps/engine`, `apps/ws`, `apps/db-events`)**: Run directly on Bun's native V8-based JavaScript runtime (`bun run index.ts`).

---

## 2. Recommended Production Deployment Architecture

```mermaid
graph TD
    subgraph Edge ["Edge / Load Balancer"]
        Cloudflare["Cloudflare / NGINX Ingress"]
    end

    subgraph ContainerCluster ["Container Cluster (ECS / EKS / Nomad)"]
        WebStatic["Static Hosting (S3 / Cloudflare Pages / NGINX)<br/>Serves apps/web"]
        BackendPod["Backend Pod (apps/backend)<br/>Horizontally Scalable"]
        WSPod["WebSocket Gateway Pod (apps/ws)<br/>Horizontally Scalable"]
        EnginePod["Matching Engine Pod (apps/engine)<br/>Single Active Writer Instance"]
        DBWorkerPod["DB Events Worker (apps/db-events)<br/>Scalable Consumer Group"]
    end

    subgraph ManagedInfra ["Managed Cloud Infrastructure"]
        RedisCluster[("Managed Redis Cluster<br/>(AWS ElastiCache / Redis Enterprise)")]
        PostgresCluster[("Managed PostgreSQL 16<br/>(AWS RDS / Aurora Multi-AZ)")]
    end

    Cloudflare --> WebStatic
    Cloudflare --> BackendPod
    Cloudflare --> WSPod

    BackendPod --> RedisCluster
    BackendPod --> PostgresCluster
    WSPod --> RedisCluster
    EnginePod --> RedisCluster
    EnginePod -.-> PostgresCluster
    DBWorkerPod --> RedisCluster
    DBWorkerPod --> PostgresCluster
```

### Critical High-Availability Notes:
1. **Single Matching Engine Writer**: The in-memory matching engine runs deterministically on a single active instance reading sequentially from the `engine` stream. To avoid split-brain order matching, do not run multiple active engine instances on the same market ID.
2. **Stateless Gateways**: `apps/backend` and `apps/ws` are fully stateless and can be scaled horizontally behind an L7 load balancer with sticky sessions for WebSocket connections.
3. **Resilient Persistence**: `apps/db-events` can scale consumers across the `db-consumer-group` to handle high-throughput fill ingestion into PostgreSQL.
