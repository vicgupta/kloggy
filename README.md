# Kloggy

A TypeScript blog agent for a solo founder/creator. Researches a topic, drafts and humanizes a post, holds it for human approval, and publishes to Dev.to — with every source stored in a searchable SQLite library.

## Install

One-liner (macOS / Linux):

```sh
curl -fsSL https://raw.githubusercontent.com/vicgupta/kloggy/main/install.sh | bash
```

Or run the installer manually:

```sh
curl -fsSL https://raw.githubusercontent.com/vicgupta/kloggy/main/install.sh -o install.sh
chmod +x install.sh
./install.sh
```

Install to a custom location:

```sh
INSTALL_DIR="$HOME/.local/bin" ./install.sh
```

## Usage

```sh
kloggy            # start server + open browser (default port 3000)
kloggy --version  # print version
kloggy update     # self-update to latest release
```

Configure via `.env` beside the binary (`HOST`, `PORT`, `DEVTO_API_KEY`, `OPENCODE_MODEL`, ...).

## Build from source

```sh
bun install
bun run dev          # run
bun run dev:watch    # run with hot reload
bun run build        # compile binary
```

## License

MIT