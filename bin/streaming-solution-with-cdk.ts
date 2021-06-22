#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { StreamingSolutionWithCdkStack } from '../lib/streaming-solution-with-cdk-stack';
import { Tags } from '@aws-cdk/core';

const app = new cdk.App();
const solution = new StreamingSolutionWithCdkStack(app, 'StreamingSolutionWithCdkStack');

// https://aws.amazon.com/answers/account-management/aws-tagging-strategies/
Tags.of(solution).add( 'project', 'atlas')
Tags.of(solution).add( 'role', 'real time streaming and storage')
Tags.of(solution).add( 'version', '1.0')
Tags.of(solution).add( 'environment', 'dev')
Tags.of(solution).add( 'date synthesized', new Date().toISOString())