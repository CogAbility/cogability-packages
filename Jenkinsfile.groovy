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
                            env.SDK_VERSION = sh(
                                script: "cd packages/sdk && npm version ${params.SDK_BUMP_TYPE} --no-git-tag-version --no-workspaces-update | tr -d 'v'",
                                returnStdout: true
                            ).trim()
                            env.SDK_BUMPED  = 'true'
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
                            env.KIT_VERSION = sh(
                                script: "cd packages/membership-kit && npm version ${params.KIT_BUMP_TYPE} --no-git-tag-version --no-workspaces-update | tr -d 'v'",
                                returnStdout: true
                            ).trim()
                            env.KIT_BUMPED  = 'true'
                        }
                        // NEW_VERSION preserved for the Approval / Update-Template stages
                        // below, which remain kit-scoped.
                        env.NEW_VERSION = env.KIT_VERSION
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

                            GIT_TOKEN=\$(aws secretsmanager get-secret-value --secret-id github_access_token_jenkins --query SecretString --output text --region ${AWS_REGION})

                            git config --global user.email "${GIT_AUTHOR_EMAIL}"
                            git config --global user.name "${GIT_AUTHOR_NAME}"

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
                                git push https://tim.millett%40cogability.com:\${GIT_TOKEN}@github.com/CogAbility/cogability-packages.git main
                            else
                                echo "No version bumps to commit"
                            fi

                            if [ "${env.SDK_PUBLISHED}" = "true" ]; then
                                git tag -a "sdk-v${env.SDK_VERSION}" -m "Release @cogability/sdk@${env.SDK_VERSION} — tagged by Jenkins on \$(date)"
                                git push https://tim.millett%40cogability.com:\${GIT_TOKEN}@github.com/CogAbility/cogability-packages.git "sdk-v${env.SDK_VERSION}"
                            fi
                            if [ "${env.KIT_PUBLISHED}" = "true" ]; then
                                git tag -a "membership-kit-v${env.KIT_VERSION}" -m "Release @cogability/membership-kit@${env.KIT_VERSION} — tagged by Jenkins on \$(date)"
                                git push https://tim.millett%40cogability.com:\${GIT_TOKEN}@github.com/CogAbility/cogability-packages.git "membership-kit-v${env.KIT_VERSION}"
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

                            if (userInput.UPDATE_TEMPLATE == 'Yes') {
                                env.DO_UPDATE_TEMPLATE = 'true'
                                echo 'Template update approved'
                            } else {
                                env.DO_UPDATE_TEMPLATE = 'false'
                                echo 'Template update declined'
                            }
                        }
                    } catch (err) {
                        echo 'Approval timeout or cancelled. Skipping template update.'
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

                            GIT_TOKEN=\$(aws secretsmanager get-secret-value --secret-id github_access_token_jenkins --query SecretString --output text --region ${AWS_REGION})

                            git config --global user.email "${GIT_AUTHOR_EMAIL}"
                            git config --global user.name "${GIT_AUTHOR_NAME}"

                            rm -rf cogbot-membership-website-template
                            git clone https://tim.millett%40cogability.com:\${GIT_TOKEN}@github.com/CogAbility/cogbot-membership-website-template.git
                            cd cogbot-membership-website-template
                            git checkout main

                            npm pkg set dependencies.@cogability/membership-kit="^${env.KIT_VERSION}"

                            git add package.json
                            git diff --cached --quiet || git commit -m "Update @cogability/membership-kit to ${env.KIT_VERSION}"
                            git push https://tim.millett%40cogability.com:\${GIT_TOKEN}@github.com/CogAbility/cogbot-membership-website-template.git main

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
            """
        }
    }
}
