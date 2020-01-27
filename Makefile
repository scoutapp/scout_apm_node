.PHONY: all dev-setup git-hook-install clean \
				check-tool-docker check-tool-yarn check-tool-entr \
				lint lint-watch build build-watch \
				test test-unit test-int test-e2e \
				test-dashboard-send test-integrations \
				ensure-docker-images ensure-pg-docker-image test-integration-pg \
				ensure-mysql-docker-image test-integration-mysql test-integration-mysql2 \
				test-integration-pug test-integration-mustache test-integration-ejs \
				generate-agent-configs \
				package print-package-filename

all: install build

YARN ?= yarn
NPM ?= npm
ENTR ?= entr
DEV_SCRIPTS ?= .dev/scripts
TAPE ?= ./node_modules/.bin/tape
DOCKER ?= docker

GIT_HOOKS_DIR = .dev/git/hooks
DIST_DIR = dist

PACKAGE_NAME ?= $(shell grep name package.json | cut -d ' ' -f 4 | tr -d ,\")
VERSION ?= $(shell grep version package.json | cut -d ' ' -f 4 | tr -d ,\")

check-tool-entr:
	@which entr > /dev/null || (echo -e "\n[ERROR] please install entr (http://entrproject.org/)" && exit 1)

check-tool-yarn:
	@which yarn > /dev/null || (echo -e "\n[ERROR] please install yarn (http://yarnpkg.com/)" && exit 1)

check-tool-docker:
	@which docker > /dev/null || (echo -e "\n[ERROR] please install docker (http://docs.docker.com/)" && exit 1)

install:
	@echo -e "=> running yarn install..."
	$(YARN) install

git-hook-install:
	@echo -e "=> copying hooks from [$(GIT_HOOKS_DIR)] to [.git/hooks]..."
	cp -r $(GIT_HOOKS_DIR)/* .git/hooks

dist:
	@echo -e "=> creating dist directory..."
	mkdir -p $(DIST_DIR)

###############
# Development #
###############

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

#########
# Tests #
#########

test: test-unit test-int test-e2e test-integrations

test-unit: check-tool-yarn
	$(YARN) test-unit

test-int: check-tool-yarn
	$(YARN) test-int

test-e2e: ensure-docker-images check-tool-docker check-tool-yarn
	$(YARN) test-e2e

test-dashboard-send: check-tool-yarn
	@echo -e "running a test that will send a test to the dashboard, it should take ~ 30 seconds to run..."
	$(YARN) test-dashboard-send

test-integrations: test-integration-pg test-integration-mysql

ensure-docker-images: ensure-mysql-docker-image ensure-pg-docker-image

PG_DOCKER_IMAGE ?= postgres:alpine
ensure-pg-docker-image:
	$(DOCKER) pull $(PG_DOCKER_IMAGE)

test-integration-pg:
	$(YARN) test-integration-pg

MYSQL_DOCKER_IMAGE ?= mysql:5.7.29
ensure-mysql-docker-image:
	$(DOCKER) pull $(MYSQL_DOCKER_IMAGE)

test-integration-mysql:
	$(YARN) test-integration-mysql

test-integration-mysql2:
	$(YARN) test-integration-mysql2

test-integration-pug:
	$(YARN) test-integration-pug

test-integration-mustache:
	$(YARN) test-integration-mustache

test-integration-ejs:
	$(YARN) test-integration-ejs

generate-agent-configs:
	$(DEV_SCRIPTS)/generate-download-configs.js lib/download-configs.ts

#############
# Packaging #
#############

PACKAGE_FILENAME ?= $(PACKAGE_NAME)-v$(VERSION).tgz
TARGET_DIR ?= target

print-package-filename:
	@echo "$(PACKAGE_FILENAME)"

# NOTE: if you try to test this package locally (ex. using `yarn add path/to/scout-apm-<version>.tgz`),
# you will have to `yarn cache clean` between every update.
# as one command: `yarn cache clean && yarn remove scout-apm && yarn add path/to/scout-apm-v0.1.0.tgz`
package: clean build
	$(YARN) pack
	mv $(PACKAGE_FILENAME) target/
