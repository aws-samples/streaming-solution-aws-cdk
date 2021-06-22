# Streaming Solution with the AWS CDK

This is a sample CDK project that shows how to provision kinesis resources to build a real time analytical application.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template

## Build steps

These build steps where produced on a MacOS machine where python 3 is installed and alias as `python3` and the CDK command line tool (`cdk`) was installed via `npm install -g aws-cdk`

1. Clone the repository to your local machine
2. `cd` into the repository
3. Execute `npm install` to download all dependencies
4. Run `cdk deploy` to deploy all resources
5. Take note of CDK outputs when CDK finishes
6. Install boto3 and faker libraries by running `pip3 install boto3 faker`
7. Update scripts/producer.py with the AWS region where you deployed the CDK app.
8. Once provisioned, run `python3 scripts/producer.py`
9. Enter the stream name from CDK outputs
10. Visit the URL for the DynamoDB table view and watch updates come in.

## Clean up steps

Run `cdk destroy` to cleanup all provisioned resources.


## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the Apache-2.0 License.

