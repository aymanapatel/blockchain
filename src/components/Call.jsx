import React, { useState, useEffect } from "react";
import * as borsh from 'borsh';
import { Alert, Button, Space, Col, Typography } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import {
  Connection,
  PublicKey,
  Keypair,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Transaction,
  SystemProgram} from "@solana/web3.js";

import { getNodeRpcURL, getAccountExplorerURL, getNodeWsURL, getTxExplorerURL } from "../lib/utils";

const { Text } = Typography;

// The state of a greeting account managed by the hello world program
class GreetingAccount {
  counter = 0;
  constructor(fields = undefined) {
    if (fields) {
      this.counter = fields.counter;
    }
  }
}

// Borsh schema definition for greeting accounts
const GreetingSchema = new Map([
  [GreetingAccount, {kind: 'struct', fields: [['counter', 'u32']]}],
]);

// The expected size of each greeting account.
const GREETING_SIZE = borsh.serialize(
  GreetingSchema,
  new GreetingAccount(),
).length;

const PAYER_SECRET_KEY = [37,146,15,4,211,176,38,120,33,161,45,219,22,221,246,237,78,48,133,46,226,34,154,103,99,106,195,106,148,234,39,117,125,126,228,210,181,12,57,69,164,212,98,234,204,206,3,47,124,30,236,86,122,61,65,159,67,216,118,118,252,206,44,60];
const PROGRAM_SECRET_KEY = [167,164,112,22,213,72,178,0,144,17,42,158,3,78,153,7,105,74,5,4,8,50,209,128,247,58,156,238,160,23,147,15,113,173,132,178,127,55,40,98,122,69,6,66,70,204,218,145,135,225,208,133,235,27,128,56,249,235,35,137,237,104,210,229]

const Program = () => {
  const [connection, setConnection] = useState(null);
  const [programId, setProgramId] = useState(null);
  const [greeterPublicKey, setGreeterPublicKey] = useState(null);
  const [greetingsCounter, setGreetingsCounter] = useState(null);
  const [greetFetching, setGreetFetching] = useState(false);
  const [greetTxSignature, setGreetTxSignature] = useState(null);

  useEffect(() => {
    establishConnection();
  }, [])

  const establishConnection = () => {
    const url = getNodeRpcURL();
    const connection = new Connection(url, { wsEndpoint: getNodeWsURL() });
    setConnection(connection);
  }

  const checkProgram = async () => {
    if (!PAYER_SECRET_KEY || !PROGRAM_SECRET_KEY) {
      alert("Set PAYER_SECRET_KEY and PROGRAM_SECRET_KEY first!")
    }

    const programSecretKey = new Uint8Array(PROGRAM_SECRET_KEY);
    const programKeypair = Keypair.fromSecretKey(programSecretKey);
    const programId = programKeypair.publicKey;
    setProgramId(programId);
  
    // // Check if the program has been deployed
    // await connection.getAccountInfo(programId);
    // console.log(`Using program ${programId.toBase58()}`);

    const payerSecretKey = new Uint8Array(PAYER_SECRET_KEY);
    const payerKeypair = Keypair.fromSecretKey(payerSecretKey);
  
    // Derive the address of a greeting account from the program so that it's easy to find later.
    const GREETING_SEED = 'hello';
    const greetedPubkey = await PublicKey.createWithSeed(
      payerKeypair.publicKey,
      GREETING_SEED,
      programId,
    );
    setGreeterPublicKey(greetedPubkey)
  
    // Check if the greeting account has already been created
    const greetedAccount = await connection.getAccountInfo(greetedPubkey);
    if (greetedAccount === null) {
      console.log('Creating account', greetedPubkey.toBase58(), 'to say hello to');
      const lamports = await connection.getMinimumBalanceForRentExemption(GREETING_SIZE);
  
      const transaction = new Transaction().add(
        SystemProgram.createAccountWithSeed({
          fromPubkey: payerKeypair.publicKey,
          basePubkey: payerKeypair.publicKey,
          seed: GREETING_SEED,
          newAccountPubkey: greetedPubkey,
          lamports,
          space: GREETING_SIZE,
          programId,
        }),
      );

      sendAndConfirmTransaction(connection, transaction, [payerKeypair])
        .then(res => console.log(`res`, res))
        .catch(err => console.log(`err`, err))
    }
  }

  const greet = async () => {
    // Load the payer's Keypair from the Uint8Array PAYER_SECRET_KEY
    // by using Keypair.fromSecretKey
    // https://solana-labs.github.io/solana-web3.js/classes/keypair.html#fromsecretkey
    const payerSecretKey = new Uint8Array(PAYER_SECRET_KEY);
    const payerKeypair = Keypair.fromSecretKey(payerSecretKey);
  
    // Create the TransactionInstruction by passing keys, programId and data
    // For data you can pass Buffer.alloc(0) as all the program's instructions are the same
    const instruction = new TransactionInstruction({
      keys: [{pubkey: greeterPublicKey, isSigner: false, isWritable: true}],
      programId,
      data: Buffer.alloc(0), // All instructions are hellos
    });
  
    // Call sendAndConfirmTransaction
    // https://solana-labs.github.io/solana-web3.js/modules.html#sendandconfirmtransaction
    // On success, call getGreetings() to fetch the greetings counter
    setGreetFetching(true);
    sendAndConfirmTransaction(
      connection,
      new Transaction().add(instruction),
      [payerKeypair],
    ).then(res => {
      console.log(`SUCCESS`, res);
      setGreetTxSignature(res);
      setGreetFetching(false);
      getGreetings();
    }).catch(err => {
      console.log(`ERROR`, err);
      setGreetFetching(false);
    });
  }

  const getGreetings = async () => {
    const accountInfo = await connection.getAccountInfo(greeterPublicKey);

    if (accountInfo === null) throw 'Error: cannot find the greeted account';

    const greeting = borsh.deserialize(
      GreetingSchema,
      GreetingAccount,
      accountInfo.data,
    );
    
    setGreetingsCounter(greeting.counter);
  }

  if (!greeterPublicKey) {
    return (
      <Space>
        <Button type="primary" onClick={checkProgram}>Check Program Info</Button>
      </Space>
    )
  }
  
  return (
    <Col>
      <Space direction="vertical" size="large">
        <Space direction="horizontal" size="large">
          <Button type="default" onClick={checkProgram}>Check Program Info</Button>
          <Text strong>Program deployed!</Text>
          <a href={getAccountExplorerURL(programId.toString())} target="_blank" rel="noreferrer">View program on Solana Explorer</a>
        </Space>
        <Button type="primary" onClick={greet}>Send a greeting to the program</Button>
        {
          greetFetching &&
            <Space size="large">
              <LoadingOutlined style={{ fontSize: 24, color: "#1890ff" }} spin />
              <Text italic={true} type="secondary">Transaction initiated. Waiting for confirmations...</Text>
            </Space>
        }
        {
          greetTxSignature && !greetFetching &&
            <Alert
              message={
                <Space direction="horizontal">
                  <Text strong>Transaction confirmed!</Text>
                  <Text>{`Greetings Counter: ${greetingsCounter}`}</Text>
                </Space>
              }
              description={
                <a href={getTxExplorerURL(greetTxSignature)} target="_blank" rel="noreferrer">View transaction on Solana Explorer</a>
              }
              type="success"
              showIcon
            />
        }
      </Space>
    </Col>
  );
}

export default Program