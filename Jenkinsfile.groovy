pipeline {
    agent {
        label 'default-dind'
    }

    parameters {
        choice(
            name: 'SDK_BUMP_TYPE',
            choices: ['none', 'patch', 'minor', 'major'],
            description: 'Semver bump for @cogability/sdk. "none" = publish whatever version is already committed in packages/sdk/package.json (no bump, no commit, no tag). If that version is already on npm, the publish step is skipped (idempotent).'
        )
        choice(
            name: 'KIT_BUMP_TYPE',
            choices: ['none', 'patch', 'minor', 'major'],
            description: 'Semver bump for @cogability/membership-kit. Same semantics as SDK_BUMP_TYPE.'
        )
    }

    environment {
        AWS_REGION       = 'us-east-2'
        GIT_AUTHOR_EMAIL = 'devops@cogability.com'
        GIT_AUTHOR_NAME  = 'DevOps Automation'
    }

    stages {
        stage('Pre-Build') {
            steps {
                script {
                    echo '----------------------------------------------------------------------------------'
                    echo 'Starting the PRE-BUILD PHASE'

                    withAWS(credentials: 'devops-deployment-key', region: "${AWS_REGION}") {
                        sh 'npm ci'

                        // ---- SDK version resolution ----------------------------------------
                        def sdkCurrentVersion = sh(
                            script: "node -p \"require('./packages/sdk/package.json').version\"",
                            returnStdout: true
                        ).trim()
                        echo "SDK current version: ${sdkCurrentVersion}"

                        if (params.SDK_BUMP_TYPE == 'none') {
                            env.SDK_VERSION = sdkCurrentVersion
                            env.SDK_BUMPED  = 'false'
                        } else {
                            // Do not read the version off `npm version`'s stdout. In
                            // this workspace it prints two lines -- the package name,
                            // then `v0.8.1` -- so the old `| tr -d 'v'` capture stored
                            // "@cogability/sdk\n0.8.1" and the publish check below ran
                            // `npm view @cogability/sdk@@cogability/sdk 0.8.1 version`,
                            // which fails. Bump, then read the result back out of
                            // package.json the same way the current version is read
                            // above. (`tr -d 'v'` was also unsafe in its own right: it
                            // deletes every letter v, not just the version prefix.)
                            sh "cd packages/sdk && npm version ${params.SDK_BUMP_TYPE} --no-git-tag-version --no-workspaces-update"
                            env.SDK_VERSION = sh(
                                script: "node -p \"require('./packages/sdk/package.json').version\"",
                                returnStdout: true
                            ).trim()
                            env.SDK_BUMPED  = 'true'
                        }
                        // Fail loudly on a malformed version rather than interpolating
                        // it into an npm command. The publish check below treats any
                        // `npm view` error as "not published yet" and proceeds, so a
                        // bad version here becomes an attempted publish instead of a
                        // clear failure.
                        if (!(env.SDK_VERSION ==~ /^\d+\.\d+\.\d+([-+].*)?$/)) {
                            error "SDK version did not resolve to a semver: '${env.SDK_VERSION}'"
                        }
                        echo "SDK target version: ${env.SDK_VERSION} (bumped=${env.SDK_BUMPED})"

                        // ---- Kit version resolution ----------------------------------------
                        def kitCurrentVersion = sh(
                            script: "node -p \"require('./packages/membership-kit/package.json').version\"",
                            returnStdout: true
                        ).trim()
                        echo "Kit current version: ${kitCurrentVersion}"

                        if (params.KIT_BUMP_TYPE == 'none') {
                            env.KIT_VERSION = kitCurrentVersion
                            env.KIT_BUMPED  = 'false'
                        } else {
                            // Same two-line stdout problem as the SDK above.
                            sh "cd packages/membership-kit && npm version ${params.KIT_BUMP_TYPE} --no-git-tag-version --no-workspaces-update"
                            env.KIT_VERSION = sh(
                                script: "node -p \"require('./packages/membership-kit/package.json').version\"",
                                returnStdout: true
                            ).trim()
                            env.KIT_BUMPED  = 'true'
                        }
                        // NEW_VERSION preserved for the Approval / Update-Template stages
                        // below, which remain kit-scoped.
                        env.NEW_VERSION = env.KIT_VERSION
                        if (!(env.KIT_VERSION ==~ /^\d+\.\d+\.\d+([-+].*)?$/)) {
                            error "Kit version did not resolve to a semver: '${env.KIT_VERSION}'"
                        }
                        echo "Kit target version: ${env.KIT_VERSION} (bumped=${env.KIT_BUMPED})"

                        env.NPM_TOKEN = sh(
                            script: "aws secretsmanager get-secret-value --secret-id npm_publish_token --query SecretString --output text --region ${AWS_REGION}",
                            returnStdout: true
                        ).trim()

                        echo "PRE-BUILD PHASE Completed - ${new Date()}"
                        echo '----------------------------------------------------------------------------------'
                    }
                }
            }
        }

        stage('Test') {
            steps {
                script {
                    echo '----------------------------------------------------------------------------------'
                    echo 'Starting TEST PHASE'
                    echo "Test started on ${new Date()}"

                    sh 'npm test'

                    echo "TEST PHASE Completed - ${new Date()}"
                    echo '----------------------------------------------------------------------------------'
                }
            }
        }

        stage('Publish') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo '----------------------------------------------------------------------------------'
                    echo 'Starting PUBLISH PHASE'

                    withAWS(credentials: 'devops-deployment-key', region: "${AWS_REGION}") {
                        // Authenticate with npm registry once for the whole stage
                        sh """
                            echo "//registry.npmjs.org/:_authToken=${env.NPM_TOKEN}" > ~/.npmrc
                        """

                        // ---- Publish SDK (idempotent) --------------------------------------
                        env.SDK_PUBLISHED = sh(
                            script: """
                                set -e
                                EXISTING=\$(npm view @cogability/sdk@${env.SDK_VERSION} version 2>/dev/null || echo "")
                                if [ -n "\$EXISTING" ]; then
                                    echo "SKIP: @cogability/sdk@${env.SDK_VERSION} is already published on npm" >&2
                                    echo "false"
                                else
                                    echo "Publishing @cogability/sdk@${env.SDK_VERSION}..." >&2
                                    ( cd packages/sdk && npm publish ) 1>&2
                                    echo "Published @cogability/sdk@${env.SDK_VERSION} successfully" >&2
                                    echo "true"
                                fi
                            """,
                            returnStdout: true
                        ).trim().readLines().last()

                        // ---- Publish Kit (idempotent) --------------------------------------
                        env.KIT_PUBLISHED = sh(
                            script: """
                                set -e
                                EXISTING=\$(npm view @cogability/membership-kit@${env.KIT_VERSION} version 2>/dev/null || echo "")
                                if [ -n "\$EXISTING" ]; then
                                    echo "SKIP: @cogability/membership-kit@${env.KIT_VERSION} is already published on npm" >&2
                                    echo "false"
                                else
                                    echo "Publishing @cogability/membership-kit@${env.KIT_VERSION}..." >&2
                                    ( cd packages/membership-kit && npm publish ) 1>&2
                                    echo "Published @cogability/membership-kit@${env.KIT_VERSION} successfully" >&2
                                    echo "true"
                                fi
                            """,
                            returnStdout: true
                        ).trim().readLines().last()

                        echo "Publish results: sdk=${env.SDK_PUBLISHED} kit=${env.KIT_PUBLISHED}"

                        // ---- Commit version bumps + tag the just-published versions --------
                        // Only commit packages whose BUMP type wrote a new value into
                        // package.json (env.*_BUMPED == 'true'). Only tag what we actually
                        // pushed to npm in this run (env.*_PUBLISHED == 'true').
                        sh """
                            set -e
                            # Jenkins runs sh with -xe, so every command is echoed to the
                            # build log. That printed both the token assignment and every
                            # URL it was embedded in, in plaintext, to a log readable by
                            # anyone with Jenkins access -- for a token that can push to
                            # CogAbility repos. Tracing goes off before the token exists,
                            # and the token reaches git through a credentials file rather
                            # than the command line, so it cannot resurface in a trace, in
                            # `ps`, or in a git error that echoes the remote.
                            set +x

                            GIT_TOKEN=\$(aws secretsmanager get-secret-value --secret-id github_access_token_jenkins --query SecretString --output text --region ${AWS_REGION})

                            git config --global user.email "${GIT_AUTHOR_EMAIL}"
                            git config --global user.name "${GIT_AUTHOR_NAME}"
                            git config --global credential.helper "store --file=\$HOME/.git-credentials-jenkins"
                            printf 'https://tim.millett%%40cogability.com:%s@github.com\\n' "\$GIT_TOKEN" > \$HOME/.git-credentials-jenkins
                            chmod 600 \$HOME/.git-credentials-jenkins
                            unset GIT_TOKEN

                            REMOTE="https://github.com/CogAbility/cogability-packages.git"

                            STAGED=""
                            if [ "${env.SDK_BUMPED}" = "true" ]; then
                                git add packages/sdk/package.json
                                STAGED="\$STAGED sdk@${env.SDK_VERSION}"
                            fi
                            if [ "${env.KIT_BUMPED}" = "true" ]; then
                                git add packages/membership-kit/package.json
                                STAGED="\$STAGED kit@${env.KIT_VERSION}"
                            fi

                            if [ -n "\$STAGED" ]; then
                                git diff --cached --quiet || git commit -m "Release:\$STAGED"
                                # A multibranch build checks out a DETACHED HEAD, so there
                                # is no local ref named main and `git push <url> main` dies
                                # with "src refspec main does not match any". That happened
                                # *after* npm publish, so 0.8.1/0.7.1 went to the registry
                                # while the repo stayed on 0.8.0/0.7.0 with no tags. Push
                                # the commit itself at the remote branch instead. This is
                                # still a fast-forward-only push: if main moved underneath
                                # the build, it is refused rather than clobbered.
                                echo "Pushing release commit to main..."
                                git push "\$REMOTE" HEAD:refs/heads/main
                            else
                                echo "No version bumps to commit"
                            fi

                            if [ "${env.SDK_PUBLISHED}" = "true" ]; then
                                git tag -a "sdk-v${env.SDK_VERSION}" -m "Release @cogability/sdk@${env.SDK_VERSION} — tagged by Jenkins on \$(date)"
                                echo "Pushing tag sdk-v${env.SDK_VERSION}..."
                                git push "\$REMOTE" "sdk-v${env.SDK_VERSION}"
                            fi
                            if [ "${env.KIT_PUBLISHED}" = "true" ]; then
                                git tag -a "membership-kit-v${env.KIT_VERSION}" -m "Release @cogability/membership-kit@${env.KIT_VERSION} — tagged by Jenkins on \$(date)"
                                echo "Pushing tag membership-kit-v${env.KIT_VERSION}..."
                                git push "\$REMOTE" "membership-kit-v${env.KIT_VERSION}"
                            fi
                        """
                    }

                    echo "PUBLISH PHASE Completed Successfully - ${new Date()}"
                    echo '----------------------------------------------------------------------------------'
                }
            }
        }

        stage('Approval for Production') {
            when {
                allOf {
                    branch 'main'
                    environment name: 'KIT_PUBLISHED', value: 'true'
                }
            }
            steps {
                script {
                    echo '----------------------------------------------------------------------------------'
                    echo 'Waiting for approval to update the template and trigger Netlify redeploy...'

                    try {
                        timeout(time: 30, unit: 'MINUTES') {
                            def userInput = input(
                                id: 'TemplateUpdateApproval',
                                message: 'Update cogbot-membership-website-template to @cogability/membership-kit@' + env.KIT_VERSION + '?',
                                parameters: [
                                    choice(
                                        name: 'UPDATE_TEMPLATE',
                                        choices: ['No', 'Yes'],
                                        description: 'Bump the template package.json and push — triggers Netlify redeploy'
                                    )
                                ]
                            )

                            // With exactly one parameter, `input` returns that
                            // parameter's raw value (a String), not a map keyed by
                            // name. Reading userInput.UPDATE_TEMPLATE on a String
                            // throws MissingPropertyException, which the catch below
                            // swallowed -- so an approval that was actually granted
                            // logged "Approval timeout or cancelled" and skipped the
                            // template update, indistinguishable from being too slow.
                            // Same defect was found and fixed in idbroker PR #6.
                            def templateChoice = (userInput instanceof Map) ? userInput.UPDATE_TEMPLATE : userInput

                            if (templateChoice == 'Yes') {
                                env.DO_UPDATE_TEMPLATE = 'true'
                                echo 'Template update approved'
                            } else {
                                env.DO_UPDATE_TEMPLATE = 'false'
                                echo 'Template update declined'
                            }
                        }
                    } catch (err) {
                        // Include the exception so a real bug here is distinguishable
                        // from a genuine timeout instead of looking identical to one.
                        echo "Approval step did not complete with an explicit choice (timeout, cancellation, or error: ${err}). Skipping template update."
                        env.DO_UPDATE_TEMPLATE = 'false'
                    }
                }
            }
        }

        stage('Update Template') {
            when {
                allOf {
                    branch 'main'
                    environment name: 'DO_UPDATE_TEMPLATE', value: 'true'
                }
            }
            steps {
                script {
                    echo '----------------------------------------------------------------------------------'
                    echo 'Updating cogbot-membership-website-template...'

                    withAWS(credentials: 'devops-deployment-key', region: "${AWS_REGION}") {
                        sh """
                            set -e
                            # Same reason as the Publish stage: sh runs with -xe, so an
                            # embedded token would be echoed into the build log.
                            set +x

                            GIT_TOKEN=\$(aws secretsmanager get-secret-value --secret-id github_access_token_jenkins --query SecretString --output text --region ${AWS_REGION})

                            git config --global user.email "${GIT_AUTHOR_EMAIL}"
                            git config --global user.name "${GIT_AUTHOR_NAME}"
                            git config --global credential.helper "store --file=\$HOME/.git-credentials-jenkins"
                            printf 'https://tim.millett%%40cogability.com:%s@github.com\\n' "\$GIT_TOKEN" > \$HOME/.git-credentials-jenkins
                            chmod 600 \$HOME/.git-credentials-jenkins
                            unset GIT_TOKEN

                            rm -rf cogbot-membership-website-template
                            git clone https://github.com/CogAbility/cogbot-membership-website-template.git
                            cd cogbot-membership-website-template
                            git checkout main

                            npm pkg set dependencies.@cogability/membership-kit="^${env.KIT_VERSION}"

                            # Refresh the lockfile in the same commit. Bumping package.json
                            # alone leaves the two out of sync, and the template's build
                            # installs from the lockfile — so the deploy would either keep
                            # shipping the old kit or fail outright on `npm ci`.
                            npm install --package-lock-only

                            # That install alone is not enough. It will not move a transitive
                            # dependency that still satisfies its range, and the kit depends on
                            # the SDK by caret, which on a 0.x version spans every patch. When
                            # kit 0.9.0 shipped needing an API added in sdk 0.9.1, the refresh
                            # left the lockfile's existing sdk 0.9.0 in place — it satisfies
                            # ^0.9.0 — and every signed-in visitor hit a TypeError. Move the
                            # transitive SDK forward explicitly.
                            npm update @cogability/sdk --package-lock-only

                            # Refuse to push a lockfile that pairs this kit with an SDK the kit
                            # cannot run against. A red build here is recoverable; a green one
                            # that blanks the deployed site is not. The kit must match this
                            # release exactly; the SDK must be at least the version this release
                            # was built against, since a newer patch is fine.
                            node -e 'const lock = require("./package-lock.json");
                              const resolved = function (name) {
                                const entry = lock.packages && lock.packages["node_modules/" + name];
                                return entry && entry.version;
                              };
                              const cmp = function (a, b) {
                                const left = String(a).split("."), right = String(b).split(".");
                                for (var i = 0; i < 3; i++) {
                                  const x = Number(left[i] || 0), y = Number(right[i] || 0);
                                  if (x !== y) return x < y ? -1 : 1;
                                }
                                return 0;
                              };
                              const wantKit = "${env.KIT_VERSION}", wantSdk = "${env.SDK_VERSION}";
                              const kit = resolved("@cogability/membership-kit"), sdk = resolved("@cogability/sdk");
                              const problems = [];
                              if (!wantKit || !wantSdk) problems.push("pipeline computed an empty version: kit=" + wantKit + " sdk=" + wantSdk);
                              if (kit !== wantKit) problems.push("membership-kit resolved " + kit + ", expected " + wantKit);
                              if (!sdk || cmp(sdk, wantSdk) < 0) problems.push("sdk resolved " + sdk + ", expected at least " + wantSdk);
                              if (problems.length) {
                                console.error("LOCKFILE SKEW, refusing to push:");
                                problems.forEach(function (p) { console.error("  " + p); });
                                process.exit(1);
                              }
                              console.log("lockfile pairs membership-kit " + kit + " with sdk " + sdk);'

                            git add package.json package-lock.json
                            git diff --cached --quiet || git commit -m "Update @cogability/membership-kit to ${env.KIT_VERSION}"
                            git push https://github.com/CogAbility/cogbot-membership-website-template.git main

                            echo "cogbot-membership-website-template updated to @cogability/membership-kit@${env.KIT_VERSION}"
                        """
                    }

                    echo "UPDATE TEMPLATE PHASE Completed Successfully - ${new Date()}"
                    echo '----------------------------------------------------------------------------------'
                }
            }
        }
    }

    post {
        success {
            echo "Pipeline completed successfully!"
            echo "SDK: ${env.SDK_VERSION} (published=${env.SDK_PUBLISHED})"
            echo "Kit: ${env.KIT_VERSION} (published=${env.KIT_PUBLISHED})"
        }
        failure {
            echo "Pipeline failed. Please check the logs for details."
        }
        always {
            sh """
                rm -rf cogbot-membership-website-template || true
                rm -f ~/.npmrc || true
                # Written by the Publish / Update Template stages. Removed here rather
                # than at the end of those stages so it goes away on failure too, which
                # is exactly when a stage does not reach its own cleanup.
                rm -f \$HOME/.git-credentials-jenkins || true
                git config --global --unset credential.helper || true
            """
        }
    }
}
