FROM docker.repo.local.sfdc.net/sfci/central-performance-foundations/playwright-base-image:jenkins-central-performance-foundations-playwright-base-image-master-latest-itest
WORKDIR /tmp

# Ensure writable temp and results directories for non-root runtime user
RUN mkdir -p /tmp/npm-tmp /tmp/results \
    && chmod 1777 /tmp/npm-tmp /tmp/results

# Direct Node/npm/Playwright temp usage away from any root-owned leftovers
ENV TMPDIR=/tmp/npm-tmp \
    NPM_CONFIG_TMP=/tmp/npm-tmp \
    PW_TMPDIR_FOR_TEST=/tmp/npm-tmp

# Copy only essential files for playwright execution
COPY package.json ./
COPY node_modules/ ./node_modules/
COPY test-plans/ ./test-plans/
COPY workload-metadata/ ./workload-metadata/
COPY test-scripts/ ./test-scripts/
COPY test-config/ ./test-config/
COPY playwright.config.js ./

ENTRYPOINT /tmp/worker load_type nebula