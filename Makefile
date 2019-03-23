.PHONY: all dev-setup git-hook-install clean \
				lint lint-watch build build-watch \
				test test-unit test-int test-e2e

all: build

YARN ?= yarn
NPM ?= npm
ENTR ?= entr

TAPE ?= ./node_modules/.bin/tape

GIT_HOOKS_DIR = .dev/git/hooks

check-tool-entr:
	@which entr > /dev/null || (echo -e "\n[ERROR] please install entr (http://entrproject.org/)" && exit 1)

yarn-install:
	@echo -e "=> running yarn install..."
	$(YARN) install

git-hook-install:
	@echo -e "=> copying hooks from [$(GIT_HOOKS_DIR)] to [.git/hooks]..."
	cp -r $(GIT_HOOKS_DIR)/* .git/hooks

dist:
	@echo -e "=> creating dist directory..."
	mkdir -p dist

dev-setup: dist yarn-install git-hook-install

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

test-unit:
	$(TAPE) "dist/test/**/*.unit.js"

test-int:
	$(TAPE) "dist/test/**/*.int.js"

test-e2e:
	$(TAPE) "dist/test/**/*.e2e.js"
