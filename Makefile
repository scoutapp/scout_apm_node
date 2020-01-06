.PHONY: all dev-setup git-hook-install clean \
				lint lint-watch build build-watch \
				test test-unit test-int test-e2e \
				generate-agent-configs

all: install build

YARN ?= yarn
NPM ?= npm
ENTR ?= entr
DEV_SCRIPTS ?= .dev/scripts
TAPE ?= ./node_modules/.bin/tape

GIT_HOOKS_DIR = .dev/git/hooks

check-tool-entr:
	@which entr > /dev/null || (echo -e "\n[ERROR] please install entr (http://entrproject.org/)" && exit 1)

check-tool-yarn:
	@which yarn > /dev/null || (echo -e "\n[ERROR] please install yarn (http://yarnpkg.com/)" && exit 1)

install:
	@echo -e "=> running yarn install..."
	$(YARN) install

git-hook-install:
	@echo -e "=> copying hooks from [$(GIT_HOOKS_DIR)] to [.git/hooks]..."
	cp -r $(GIT_HOOKS_DIR)/* .git/hooks

dist:
	@echo -e "=> creating dist directory..."
	mkdir -p dist

dev-setup: dist install git-hook-install

lint:
	$(YARN) lint

lint-watch: check-tool-entr
	find . -name "*.ts" | $(ENTR) -rc $(YARN) lint

build: dist
	$(YARN) build

build-watch: dist
	$(YARN) build-watch

clean:
	rm -rf dist/*

test: test-unit test-int test-e2e

test-unit: check-tool-yarn
	$(YARN) test-unit

test-int: check-tool-yarn
	$(YARN) test-int

test-e2e: check-tool-yarn
	$(YARN) test-e2e

test-dashboard-send: check-tool-yarn
	@echo -e "running a test that will send a test to the dashboard, it should take ~ 30 seconds to run..."
	$(YARN) test-dashboard-send

generate-agent-configs:
	$(DEV_SCRIPTS)/generate-download-configs.js lib/download-configs.ts
