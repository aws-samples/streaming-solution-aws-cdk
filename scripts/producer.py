"""Producer produces fake data to be inputted into a Kinesis stream."""
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0


import json
import time
import uuid
import random
from datetime import datetime
from pprint import pprint

import boto3

from faker import Faker

# This boots up the kinesis analytic application so you don't have to click "run" on the kinesis analytics console
try:
    kinesisanalytics = boto3.client("kinesisanalyticsv2", region_name="us-east-1")
    kinesisanalytics.start_application(
        ApplicationName="abnormality-detector",
        RunConfiguration={
            'SqlRunConfigurations': [
                {
                    'InputId': '1.1',
                    'InputStartingPositionConfiguration': {
                        'InputStartingPosition': 'NOW'
                    }
                },
            ]
        }
    )
    print("Giving 30 seconds for the kinesis analytics application to boot")
    time.sleep(30)
except kinesisanalytics.exceptions.ResourceInUseException:
    print("Application already running, skipping start up step")

rootSteamName = input("Please enter the stream name that was outputted from cdk deploy - (StreamingSolutionWithCdkStack.RootStreamName): ")
kinesis = boto3.client("kinesis", region_name="us-east-1")
fake = Faker()

# Base table, GUID with transaction key, GSI with a bank id (of 5 notes) pick one of the five bank IDs. Group by bank ID. sorted by etc

banks = []
for _ in range(10):
    banks.append(fake.swift())

while True:
    payload = {
        "transactionId": str(uuid.uuid4()),
        "name": fake.name(),
        "age": fake.random_int(min=18, max=85, step=1),
        "address": fake.address(),
        "city": fake.city(),
        "state": fake.state(),
        "transaction": fake.random_int(min=1000, max=10000, step=1),
        "bankId": banks[random.randrange(0, len(banks))],
        "createdAt": str(datetime.now()),
    }
    response = kinesis.put_record(
        StreamName=rootSteamName, Data=json.dumps(payload), PartitionKey="abc"
    )
    pprint(response)
    time.sleep(1)
