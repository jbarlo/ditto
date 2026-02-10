{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        nodeTools = with pkgs; [
          nodejs_22
          pnpm
        ];

        imageTools = with pkgs; [
          vips
        ];

        firmwareTools = with pkgs; [
          platformio-core
          esptool
          minicom
        ];

        devTools = with pkgs; [
          jq
          httpie
          curl
          just
          qrencode
          sqlite
          turso-cli
        ];

      in {
        devShells.default = pkgs.mkShell {
          packages = nodeTools ++ imageTools ++ devTools;

          shellHook = ''
            export PATH="$PWD/server/node_modules/.bin:$PATH"
            echo "ditto dev - run 'just' for commands"
          '';
        };

        devShells.firmware = pkgs.mkShell {
          packages = nodeTools ++ imageTools ++ devTools ++ firmwareTools;
          shellHook = ''
            export PATH="$PWD/server/node_modules/.bin:$PATH"
            echo "ditto dev (with firmware tools)"
          '';
        };
      });
}
