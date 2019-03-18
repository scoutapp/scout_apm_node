.PHONY: all dev-setup git-hook-install clean \
				lint build build-watch \
				test test-unit test-int test-e2e

all: build

YARN ?= yarn
NPM ?= npm

TAPE ?= ./node_modules/.bin/tape

GIT_HOOKS_DIR = .dev/git/hooks

yarn-install:
	@echo -e "=> running yarn install..."
	$(YARN) install

git-hook-install:
	@echo -e "=> copying hooks from [$(GIT_HOOKS_DIR)] to [.git/hooks]..."
	cp -r $(GIT_HOOKS_DIR) .git/hooks

dist:
	@echo -e "=> creating dist directory..."
	mkdir -p dist

dev-setup: dist yarn-install git-hook-install

lint:
	$(YARN) lint

build: dist
	$(YARN) build

build-watch: dist
	$(YARN) build-watch


clean:
	rm -rf dist/*

test: test-unit test-int test-e2e

test-unit:
	$(TAPE) "dist/test/**/*.unit.js"

test-int:
	$(TAPE) "dist/test/**/*.int.js"

test-e2e:
	$(TAPE) "dist/test/**/*.e2e.js"
