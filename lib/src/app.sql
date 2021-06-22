-- Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
-- SPDX-License-Identifier: Apache-2.0
-- ** Continuous Filter ** 
    -- Performs a continuous filter based on a WHERE condition.
    --          .----------.   .----------.   .----------.              
    --          |  SOURCE  |   |  INSERT  |   |  DESTIN. |              
    -- Source-->|  STREAM  |-->| & SELECT |-->|  STREAM  |-->Destination
    --          |          |   |  (PUMP)  |   |          |              
    --          '----------'   '----------'   '----------'               
    -- STREAM (in-application): a continuously updated entity that you can SELECT from and INSERT into like a TABLE
    -- PUMP: an entity used to continuously 'SELECT ... FROM' a source STREAM, and INSERT SQL results into an output STREAM
    -- Create output stream, which can be used to send to a destination
CREATE OR REPLACE STREAM "DESTINATION_SQL_STREAM" 
(
    "transactionId"     varchar(64),
    "name"              varchar(64),
    "age"               integer,
    "address"           varchar(256),
    "city"              varchar(32),
    "state"             varchar(32),
    "transaction"       integer,
    "bankId"            varchar(32),
    "createdAt"         varchar(32)
);
CREATE OR REPLACE PUMP "STREAM_PUMP" AS INSERT INTO "DESTINATION_SQL_STREAM"
SELECT STREAM "transactionId", "name", "age", "address", "city", "state", "transaction", "bankId", "createdAt"
    FROM "SOURCE_SQL_STREAM_001"
    WHERE "transaction" > 9000;