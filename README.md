# Ditto E-Ink Server

![Display on table](assets/screen.jpeg)

Share doodles with your friends with e-ink hardware!

Currently compatible with TRMNL firmware, but more firmware support can be added by request.

> [!IMPORTANT]
> This project should be treated like an early alpha.
> Until v1.0.0, please check minor version bumps for breaking changes!

This repo is a work-in-progress while I transition it for broader use.
It's still a prototype!
If anything is getting in your way, please voice it in the issues tab.

Contributions welcome!

## Features

- Shared drawing canvases frontend with not-quite-real-time sync
- Configurable device polling rates. Defaults to every 10 minutes
- Canvas albums for multi-canvas organization
- Device-to-user registration

## Setup

### Prerequisites

- Docker

or, run locally,

- Node.js 22+
- pnpm
- optional: just

Alternatively, a Nix flake is included to bundle the pre-reqs for you if you're into that.

### Environment

To start copy the env example files:

```sh
cp server/.env.example server/.env.local
# if setting DATABASE_MODE=turso
cp server/.env.turso.example server/.env.turso
```

#### Configuration

By default, Ditto stores image and application data locally.
Environment variables control if an external service should be used instead:

- `DATABASE_MODE`: `local` (default) or `turso`
- `STORAGE_MODE`: `local` (default) or `r2`

For the time being, Ditto's auth is tied pretty closely to WorkOS and doesn't
manage identity data.

The goal is to move away from mandatory external dependencies soon, but in the
meantime the WorkOS-related variables in `.env.example` are necessary.

### Development

```sh
cd server
pnpm install
# initialize local sqlite file
pnpm db:push
# start server at localhost:3000
pnpm dev
```

Run tests with:

```sh
cd server
pnpm test
```

Generate schema migrations with:

```sh
cd server
pnpm db:generate
```

### Production Builds

The Docker image is the easiest way to set up self-hosting.
To build for a dedicated Nextjs target like Vercel, follow the local build
instructions instead.

#### Docker

To run a Docker production build:

```sh
# Build the server/migration image
docker compose build

# NOTE: Make sure your env files under the server dir are populated before the
# next step

# Run migrations:
docker compose run --rm migrate

# Start the server:
docker compose up
```

A build and migrate is needed for any update.

> [!NOTE]
> When using local storage/db modes (`STORAGE_MODE=local` and
> `DATABASE_MODE=local` respectively), data is stored in the ditto-uploads and
> ditto-data Docker volumes. If you want to avoid data loss, consider backups
> or bind mounts.

#### Local

If you want to do your builds yourself, the important commands are:

```sh
cd server
pnpm install
pnpm build
```

Migrations are run with:

```sh
pnpm db:migrate
```

## Frame Setup Guide

1. Point the device firmware at your server instance (`<BASE_URL>/trmnl`)
   - on TRMNL devices, this may need reflashing. See the [TRMNL Firmware Repo](https://github.com/usetrmnl/trmnl-firmware) and [TRMNL BYOD Wiki page](https://docs.trmnl.com/go/diy/byod) for instructions.
2. Your device should display a claim screen (see image below)
3. Scan the QR code or navigate to the provided URL
4. Log in or sign up, then fill in the ID and code on the frame
5. Your device should now be registered. It might need a restart to refresh the screen

![Device claim screen](assets/claim-image.png)

> [!NOTE]
> As of v1.7.3, setting the server URL on the TRMNL firmware can be slightly confusing:
> 1. In the WiFi setup captured portal, click the "Advanced" button
> 2. Then click "Custom Server", and "Yes" in the warning modal
> 3. Fill in your API details, then click "Back to Wi-Fi" to finish filling out your network details

## Device Configuration

This server was originally built to doodle between two [Seeed Studio TRMNL 7.5" DIY Kits](https://www.seeedstudio.com/TRMNL-7-5-Inch-OG-DIY-Kit-p-6481.html).
If your devices are different, you might need to adjust values in `server/lib/config.ts`.

If you find a specific device does or doesn't work with the config values available, please open an issue!

## Roadmap

- ~Dockerfile and~ external dependency decoupling (auth, ~r2, db provider~)
- Support for multiple devices of different sizes
- Album gallery mode

## License

Apache 2.0
