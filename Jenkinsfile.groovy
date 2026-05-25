pipeline {
    agent {
        label 'default-dind'
    }

    parameters {
        choice(
            name: 'BUMP_TYPE',
            choices: ['patch', 'minor', 'major'],
            description: 'Semver bump type for @cogability/membership-kit'
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
                        // Install dependencies
                        sh 'npm ci'

                        // Read current version from membership-kit package.json
                        def currentVersion = sh(
                            script: "node -p \"require('./packages/membership-kit/package.json').version\"",
                            returnStdout: true
                        ).trim()
                        echo "Current version: ${currentVersion}"

                        // Compute new version (writes to package.json but no git tag)
                        env.NEW_VERSION = sh(
                            script: "cd packages/membership-kit && npm version ${params.BUMP_TYPE} --no-git-tag-version --no-workspaces-update | tr -d 'v'",
                            returnStdout: true
                        ).trim()
                        echo "New version: ${env.NEW_VERSION}"

                        // Fetch npm auth token from AWS Secrets Manager
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
                    echo "Publishing @cogability/membership-kit@${env.NEW_VERSION}..."

                    withAWS(credentials: 'devops-deployment-key', region: "${AWS_REGION}") {
                        sh """
                            # Authenticate with npm registry
                            echo "//registry.npmjs.org/:_authToken=${env.NPM_TOKEN}" > ~/.npmrc

                            # Publish from the membership-kit package directory
                            cd packages/membership-kit
                            npm publish

                            echo "Published @cogability/membership-kit@${env.NEW_VERSION} successfully"
                        """

                        // Retrieve GitHub token from AWS Secrets Manager
                        sh """
                            set -e

                            GIT_TOKEN=\$(aws secretsmanager get-secret-value --secret-id github_access_token_jenkins --query SecretString --output text --region ${AWS_REGION})

                            # Configure git user
                            git config --global user.email "${GIT_AUTHOR_EMAIL}"
                            git config --global user.name "${GIT_AUTHOR_NAME}"

                            # Commit the version bump in packages/membership-kit/package.json
                            git add packages/membership-kit/package.json
                            git diff --cached --quiet || git commit -m "Release @cogability/membership-kit@${env.NEW_VERSION}"

                            # Push the commit
                            git push https://tim.millett%40cogability.com:\${GIT_TOKEN}@github.com/CogAbility/cogability-packages.git main

                            # Create and push an annotated release tag
                            git tag -a "membership-kit-v${env.NEW_VERSION}" -m "Release @cogability/membership-kit@${env.NEW_VERSION} — tagged by Jenkins on \$(date)"
                            git push https://tim.millett%40cogability.com:\${GIT_TOKEN}@github.com/CogAbility/cogability-packages.git "membership-kit-v${env.NEW_VERSION}"
                        """
                    }

                    echo "PUBLISH PHASE Completed Successfully - ${new Date()}"
                    echo '----------------------------------------------------------------------------------'
                }
            }
        }

        stage('Approval for Production') {
            when {
                branch 'main'
            }
            steps {
                script {
                    echo '----------------------------------------------------------------------------------'
                    echo 'Waiting for approval to update the template and trigger Netlify redeploy...'

                    try {
                        timeout(time: 30, unit: 'MINUTES') {
                            def userInput = input(
                                id: 'TemplateUpdateApproval',
                                message: 'Update cogbot-membership-website-template to @cogability/membership-kit@' + env.NEW_VERSION + '?',
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

                            # Configure git user
                            git config --global user.email "${GIT_AUTHOR_EMAIL}"
                            git config --global user.name "${GIT_AUTHOR_NAME}"

                            # Clone the template repository
                            rm -rf cogbot-membership-website-template
                            git clone https://tim.millett%40cogability.com:\${GIT_TOKEN}@github.com/CogAbility/cogbot-membership-website-template.git
                            cd cogbot-membership-website-template
                            git checkout main

                            # Bump @cogability/membership-kit to the exact new version
                            npm pkg set dependencies.@cogability/membership-kit="^${env.NEW_VERSION}"

                            # Commit and push — triggers Netlify auto-deploy
                            git add package.json
                            git diff --cached --quiet || git commit -m "Update @cogability/membership-kit to ${env.NEW_VERSION}"
                            git push https://tim.millett%40cogability.com:\${GIT_TOKEN}@github.com/CogAbility/cogbot-membership-website-template.git main

                            echo "cogbot-membership-website-template updated to @cogability/membership-kit@${env.NEW_VERSION}"
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
            echo "Published: @cogability/membership-kit@${env.NEW_VERSION}"
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
