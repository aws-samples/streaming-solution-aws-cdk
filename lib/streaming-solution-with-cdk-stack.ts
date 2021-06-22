// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
import * as cdk from '@aws-cdk/core';
import * as kinesis from '@aws-cdk/aws-kinesis';
import * as kinesisanalytics from '@aws-cdk/aws-kinesisanalytics';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as kinesisfirehose from '@aws-cdk/aws-kinesisfirehose';
import * as s3 from '@aws-cdk/aws-s3';
import * as sns from '@aws-cdk/aws-sns';
import * as snssub from '@aws-cdk/aws-sns-subscriptions';
import { TableViewer} from 'cdk-dynamo-table-viewer';
import * as fs from 'fs';
import * as path from 'path';

export class StreamingSolutionWithCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    // rootStream is a raw kinesis stream in which we build other modules on top of.
    const rootStream = new kinesis.Stream(this, 'RootStream')


    // Output the stream name so we can connect our script to this stream
    new cdk.CfnOutput(this, 'RootStreamName', {
      value: rootStream.streamName
    })


    // =============================================================================
    // Cold Module:
    //
    // The Cold Module reads raw data from the stream, compresses it, and sends it
    //  to S3 for later analysis
    //
    // +---------+      +----------+      +-----------+
    // |         |      |          |      |           |
    // | Stream  +----->+ Firehose +----->+ S3 Bucket |
    // |         |      |          |      |           |
    // +---------+      +----------+      +-----------+
    //
    // Constructs:
    //  IAM Role:
    //      - Kinesis firehose to kinesis stream and to S3
    //  Stream:
    //      - Firehose that pulls from rootStream, buffers, compresses, and puts raw data to S3
    //  Bucket:
    //      - An S3 bucket to store the compressed, raw data
    // =============================================================================

    // S3 bucket that will serve as the destination for our raw compressed data
    const rawDataBucket = new s3.Bucket(this, "RawDataBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY, // REMOVE FOR PRODUCTION
      autoDeleteObjects: true, // REMOVE FOR PRODUCTION
    })

    const firehoseRole = new iam.Role(this, 'firehoseRole', {
        assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com')
    });

    rootStream.grantRead(firehoseRole)
    rootStream.grant(firehoseRole, 'kinesis:DescribeStream')
    rawDataBucket.grantWrite(firehoseRole)

    const firehoseStreamToS3 = new kinesisfirehose.CfnDeliveryStream(this, "FirehoseStreamToS3", {
      deliveryStreamName: "StreamRawToS3",
      deliveryStreamType: "KinesisStreamAsSource",
      kinesisStreamSourceConfiguration: {
        kinesisStreamArn: rootStream.streamArn,
        roleArn: firehoseRole.roleArn
      },
      s3DestinationConfiguration: {
        bucketArn: rawDataBucket.bucketArn,
        bufferingHints: {
          sizeInMBs: 64,
          intervalInSeconds: 60
        },
        compressionFormat: "GZIP",
        encryptionConfiguration: {
          noEncryptionConfig: "NoEncryption"
        },
    
        prefix: "raw/",
        roleArn: firehoseRole.roleArn
      },
    })

    // Ensures our role is created before we try to create a Kinesis Firehose
    firehoseStreamToS3.node.addDependency(firehoseRole)


    // =============================================================================
    // Hot Module:
    //
    // The Hot modules reads off a kinesis stream searching for a value to surpass
    //  a certain threshold. Once this threshold is breached, it triggers a lambda
    //  function that enriches the data and fans it out to SNS and DynamoDB.
    //  SNS notifies all subscribers about the breach and DynamoDB powers a simple
    //  Table viewer web application.
    //
    //                                                       +-----------+    +-----------+
    //                                                       |           |    |           |
    //                                                       |    SNS    |    |  Emails   |
    //                                                    +->+           +--->+           |
    //                                                    |  |           |    |           |
    // +-----------+     +-----------+     +-----------+  |  +-----------+    +-----------+
    // |           |     |           |     |           |  |
    // |Raw Stream +---->+Kinesis App+---->+  Lambda   +--+
    // |           |     |           |     |           |  |  +-----------+    +-----------+
    // |           |     |           |     |           |  |  |           |    |           |
    // +-----------+     +-----------+     +-----------+  |  |  DynamoDB |    |  Table    |
    //                                                    +->+           +--->+    Viewer |
    //                                                       |           |    |           |
    //                                                       +-----------+    +-----------+
    //
    // Constructs:
    //  IAM Role:
    //      - Kinesis Analytics can interact with Lambda and Raw Stream  (STRICTER SCOPE FOR PRODUCTION)
    //  Stream Application:
    //      - Kinesis Analytic Application that monitors the stream for an abnormality above a certain threshold
    //  DynamoDB Table:
    //      - Serves as persistent storage for abnormalities
    //  Table Viewer:
    //      - Example web application built on the DynamoDB table
    //  SNS Topic:
    //      - Notification mechanism for abnormalities
    //  Lambda Function:
    //      - Custom logic to enrich data and fan out to other services
    //  Grants:
    //      - SNS Topic grants the publish permissions to fan nout lambda
    //      - DynamoDB table grants read/write permission to fan out lambda
    // =============================================================================

    // The DynamoDB table that stores anomalies detected by our kinesis analytic app
    const abnormalsTable = new dynamodb.Table(this, 'AbnormalityTable', {
      partitionKey: { name: 'transactionId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY // REMOVE FOR PRODUCTION
    })

    // TableViewer is a high level demo construct of a web app that will read and display values from DynamoDB
    const tableViewer = new TableViewer(this, 'TableViewer', {
      title: "Real Time High Transaction Table",
      table: abnormalsTable,
      sortBy: "-createdAt"
    })


    // SNS Topic that alerts anyone subscribed to an anomaly detected by the kinesis analytic application 
    const abnormalNotificationTopic = new sns.Topic(this, 'AbnormalNotification', {
      displayName: 'Abnormal detected topic'
    });
    abnormalNotificationTopic.addSubscription(new snssub.EmailSubscription('example@amazon.com'))

    // Lambda function that reads output from our kinesis analytic app and fans out to the above SNS and DynamoDB table
    const fanoutLambda = new lambda.Function(this, "LambdaFanoutFunction", {
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: 'fanout.handler',
      code: lambda.Code.fromAsset('lib/src'),
      environment: {
        TABLE_NAME: abnormalsTable.tableName,
        TOPIC_ARN: abnormalNotificationTopic.topicArn
      }
    })
    abnormalNotificationTopic.grantPublish(fanoutLambda)
    abnormalsTable.grantReadWriteData(fanoutLambda)


    const streamToAnalyticsRole = new iam.Role(this, 'streamToAnalyticsRole', {
      assumedBy: new iam.ServicePrincipal('kinesisanalytics.amazonaws.com')
    });


    streamToAnalyticsRole.addToPolicy(new iam.PolicyStatement({
      resources: [
        fanoutLambda.functionArn,
        rootStream.streamArn,
      ],
      actions: ['kinesis:*', 'lambda:*'] 
    }));


    const thresholdDetector = new kinesisanalytics.CfnApplication(this, "KinesisAnalyticsApplication", {
      applicationName: 'abnormality-detector',
      applicationCode: fs.readFileSync(path.join(__dirname, 'src/app.sql')).toString(),
      inputs: [
        {
          namePrefix: "SOURCE_SQL_STREAM",
          kinesisStreamsInput: {
            resourceArn: rootStream.streamArn,
            roleArn: streamToAnalyticsRole.roleArn
          },
          inputParallelism: { count: 1 },
          inputSchema: {
            recordFormat: {
              recordFormatType: "JSON",
              mappingParameters: { jsonMappingParameters: { recordRowPath: "$" } }
            },
            recordEncoding: "UTF-8",
            recordColumns: [
              {
                name: "transactionId",
                mapping: "$.transactionId",
                sqlType: "VARCHAR(64)"
              },
              {
                  name: "name",
                  mapping: "$.name",
                  sqlType: "VARCHAR(64)"
              },
              {
                  name: "age",
                  mapping: "$.age",
                  sqlType: "INTEGER"
              },
              {
                  name: "address",
                  mapping: "$.address",
                  sqlType: "VARCHAR(256)"
              },
              {
                  name: "city",
                  mapping: "$.city",
                  sqlType: "VARCHAR(32)"
              },
              {
                  name: "state",
                  mapping: "$.state",
                  sqlType: "VARCHAR(32)"
              },
              {
                  name: "transaction",
                  mapping: "$.transaction",
                  sqlType: "INTEGER"
              },
              {
                  name: "bankId",
                  mapping: "$.bankId",
                  sqlType: "VARCHAR(32)"
              },
              {
                  name: "createdAt",
                  mapping: "$.createdAt",
                  sqlType: "VARCHAR(32)"
              }
            ]
          }
        }
      ]
    })
    thresholdDetector.node.addDependency(streamToAnalyticsRole)


    const thresholdDetectorOutput = new kinesisanalytics.CfnApplicationOutput(this, 'AnalyticsAppOutput', {
      applicationName: 'abnormality-detector',
      output: {
        name: "DESTINATION_SQL_STREAM",
        lambdaOutput: {
          resourceArn: fanoutLambda.functionArn,
          roleArn: streamToAnalyticsRole.roleArn
        },
        destinationSchema: {
          recordFormatType: "JSON"
        }
      }
    })
    thresholdDetectorOutput.node.addDependency(thresholdDetector)

  }
}
