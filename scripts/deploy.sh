#!/usr/bin/env bash

echo "Deploying main to staging"

git push staging main
heroku run npm run db:up --app ${APP_NAME}