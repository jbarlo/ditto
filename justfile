# ditto-eink project task runner

default:
    @just --list

# ============ Development ============

# Install dependencies
install:
    cd server && pnpm install

# Build for production
build:
    cd server && pnpm build

# Start dev server
dev:
    cd server && pnpm dev

# Run tests
test:
    cd server && pnpm test

# Run tests in watch mode
test-watch:
    cd server && pnpm test:watch

# Initialize local database
db-init:
    cd server && pnpm db:push

# Reset local database (delete and reinitialize)
db-reset:
    rm -f server/local.db server/local.db-journal
    just db-init

# Generate a new migration
db-generate:
    cd server && pnpm db:generate

# Run migrations against prod
db-prod-migrate:
    cd server && bash -c 'set -a && source .env.turso && pnpm db:migrate'

# ============ Device Simulation ============

# Simulate device setup (first boot)
sim-setup mac="AA:BB:CC:DD:EE:FF":
    @echo "Simulating device setup..."
    http GET localhost:3000/trmnl/api/setup ID:"{{mac}}"

# Simulate device display request
sim-display mac="AA:BB:CC:DD:EE:FF" token="":
    @echo "Simulating display request..."
    http GET localhost:3000/trmnl/api/display \
        ID:"{{mac}}" \
        Access-Token:"{{token}}" \
        Battery-Voltage:4.2 \
        FW-Version:1.0.0 \
        RSSI:-50

# Simulate next button press
sim-next mac="AA:BB:CC:DD:EE:FF" token="":
    http GET "localhost:3000/trmnl/api/display?action=next" \
        ID:"{{mac}}" \
        Access-Token:"{{token}}"

# Simulate prev button press
sim-prev mac="AA:BB:CC:DD:EE:FF" token="":
    http GET "localhost:3000/trmnl/api/display?action=prev" \
        ID:"{{mac}}" \
        Access-Token:"{{token}}"

# Full device flow: setup then display
sim-full mac="AA:BB:CC:DD:EE:FF":
    @echo "=== Setup ===" && just sim-setup {{mac}}
    @echo "\n=== Display ===" && just sim-display {{mac}}


