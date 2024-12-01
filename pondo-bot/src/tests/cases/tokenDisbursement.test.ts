import { after, before, describe, it } from "node:test";
import * as Aleo from "@demox-labs/aleo-sdk";
import { pondoDependencyTree, pondoPrograms, pondoProgramToCode } from "../../compiledPrograms";
import { airDropCredits, getHeight, getMappingValue, getMTSPBalance, getProgram, getPublicBalance, isTransactionAccepted } from "../../aleo/client";
import {
  ADDRESS,
  MULTI_SIG_ADDRESS_0,
  MULTI_SIG_ADDRESS_1,
  MULTI_SIG_ADDRESS_2,
  MULTI_SIG_PRIVATE_KEY_0,
  MULTI_SIG_PRIVATE_KEY_1,
  MULTI_SIG_PRIVATE_KEY_2,
  NETWORK, PALEO_TOKEN_ID, PRIVATE_KEY
} from "../../constants";
import { killAuthorizePool, submitTransaction } from "../../aleo/execute";
import { deployProgram, resolveImports } from "../../aleo/deploy";
import assert from "node:assert";
import { delay, formatAleoString } from "../../util";
import { calculatePaleoForDeposit } from "../../protocol/userActions";


const timeOracleId = 'time_oracle.aleo';
const oldTokenDisbursementId = 'token_disbursement.aleo';
const tokenDisbursementId = 'token_disbursement_1.aleo';
const unlockTime = 2_150;
const tokenAmount = 1_000_000_000n;
const tokenAmount2 = 2_000_000_000n;
const claimId = '3u64';
const claimId2 = '27u64';
const protocolId: string = pondoPrograms.find((program) =>
  program.includes('pondo_protocol.aleo')
)!;
const imports = pondoDependencyTree[oldTokenDisbursementId];
const adminAddress = MULTI_SIG_ADDRESS_0!;
const withdrawAddress = MULTI_SIG_ADDRESS_1!;
const withdrawPrivateKey = MULTI_SIG_PRIVATE_KEY_1!;
const withdrawAddress2 = MULTI_SIG_ADDRESS_2!;
const withdrawPrivateKey2 = MULTI_SIG_PRIVATE_KEY_2!;


describe('Token Disbursement and Time Oracle', async () => {
  let resolvedImports: any;
  let timeOracleProgram: string;
  let tokenDisbursementProgram: string;
  let protocolProgram: string;
  let protocolImports: any;
  let tokenDisbursementAddress: string;
  let pondoProtocolAddress: string;

  before(async () => {
    console.log('Deploying time oracle and token disbursement programs...');
    resolvedImports = await resolveImports(imports);
    timeOracleProgram = await getProgram(timeOracleId);
    protocolProgram = await getProgram(protocolId);
    protocolImports = await resolveImports(pondoDependencyTree[protocolId]);
    tokenDisbursementProgram = pondoProgramToCode[oldTokenDisbursementId];
    // Update the token disbursement program with the new parameters
    tokenDisbursementProgram = tokenDisbursementProgram.replaceAll(oldTokenDisbursementId, tokenDisbursementId);
    tokenDisbursementProgram = tokenDisbursementProgram.replaceAll('22_500_000u32', `${unlockTime}u32`);

    tokenDisbursementAddress = Aleo.Program.fromString(NETWORK!, tokenDisbursementProgram).toAddress();
    const pondoProgram = await getProgram('pondo_protocol.aleo');
    pondoProtocolAddress = Aleo.Program.fromString(NETWORK!, pondoProgram).toAddress();
  });

  after(async () => {
    await killAuthorizePool();
  });

  describe('Initialize time oracle', async () => {
    it('Should be able to initialize the time_oracle', async () => {
      const txResult = await submitTransaction(
        NETWORK!,
        PRIVATE_KEY!,
        timeOracleProgram,
        'initialize',
        [],
        4,
        undefined,
        resolvedImports
      );

      const wasAccepted = await isTransactionAccepted(txResult);
      assert(wasAccepted, `${timeOracleId} initialize was rejected, but should have been accepted`);

      const timeOracleTimestamp = await getMappingValue('0u8', timeOracleId, 'timestamp');
      assert(timeOracleTimestamp == '0u64', `Time Oracle timestamp not set: ${timeOracleTimestamp}`);
    });

    it('Should be not able to initialize the time_oracle twice', async () => {
      const txResult = await submitTransaction(
        NETWORK!,
        PRIVATE_KEY!,
        timeOracleProgram,
        'initialize',
        [],
        4,
        undefined,
        resolvedImports
      );

      const wasAccepted = await isTransactionAccepted(txResult);
      assert(!wasAccepted, `${timeOracleId} initialize was accepted, but should have been rejected`);
    });
  });

  describe('Deploy and initialize the token disbursement program', () => {
    const isProgramDeployed = async (programId: string, retries = 15, timeDelay = 3_000) => {
      for (let i = 0; i < retries; i++) {
        const program = await getProgram(programId);
        if (program) {
          return true;
        }
        await delay(timeDelay);
      }
      return false;
    }

    it('Should be able to deploy the token disbursement program', async () => {
      await deployProgram(
        NETWORK!,
        PRIVATE_KEY!,
        tokenDisbursementProgram,
        resolvedImports,
        50
      );

      const wasAccepted = await isProgramDeployed(tokenDisbursementId);
      assert(wasAccepted, `${tokenDisbursementId} deploy was rejected, but should have been accepted`);
    });
  });

  describe('Setup', () => {
    it('deposit into Pondo to get some pAleo for testing', async () => {
      const amount = 100_000_000_000n; // 100k Aleo
      const expectedPaleoMinted = await calculatePaleoForDeposit(amount);

      const txResult = await submitTransaction(
        NETWORK!,
        PRIVATE_KEY!,
        protocolProgram,
        'deposit_public_as_signer',
        [`${amount.toString()}u64`, `${expectedPaleoMinted.toString()}u64`, withdrawAddress],
        4,
        undefined,
        protocolImports
      );

      const wasAccepted = await isTransactionAccepted(txResult);
      assert(wasAccepted, `deposit_public_as_signer was rejected, but should have been accepted`);
    });
  });

  describe('Create claim', () => {
    it('should be to create a claim', async () => {
      const txResult = await submitTransaction(
        NETWORK!,
        PRIVATE_KEY!,
        tokenDisbursementProgram,
        'create',
        [`${claimId}`, `${tokenAmount}u128`, withdrawAddress],
        4,
        undefined,
        resolvedImports
      );

      const wasAccepted = await isTransactionAccepted(txResult);
      assert(wasAccepted, `create was rejected, but should have been accepted`);

      const claim = await getMappingValue(claimId, tokenDisbursementId, 'claims');
      assert(claim, `Claim not found: ${claim}`);

      const claimObject = JSON.parse(formatAleoString(claim));
      assert(claimObject.credits_amount === `${tokenAmount.toString()}u128`, `Claim credits amount not set: ${claimObject.credits_amount}`);
      assert(claimObject.paleo_amount === `${tokenAmount.toString()}u128`, `Claim paleo amount not set: ${claimObject.paleo_amount}`);
      assert(claimObject.recipient === withdrawAddress, `Claim recipient not set: ${claimObject.recipient}`);
    });

    it('should not be able to create with the same claim id', async () => {
      const txResult = await submitTransaction(
        NETWORK!,
        PRIVATE_KEY!,
        tokenDisbursementProgram,
        'create',
        [`${claimId}`, `${tokenAmount2}u128`, withdrawAddress2],
        4,
        undefined,
        resolvedImports
      );

      const wasAccepted = await isTransactionAccepted(txResult);
      assert(!wasAccepted, `create was accepted, but should have been rejected`);
    });

    it('should be able to create another claim', async () => {
      const txResult = await submitTransaction(
        NETWORK!,
        PRIVATE_KEY!,
        tokenDisbursementProgram,
        'create',
        [claimId2, `${tokenAmount2}u128`, withdrawAddress2],
        4,
        undefined,
        resolvedImports
      );

      const wasAccepted = await isTransactionAccepted(txResult);
      assert(wasAccepted, `create was rejected, but should have been accepted`);

      const claim = await getMappingValue(claimId2, tokenDisbursementId, 'claims');
      assert(claim, `Claim not found: ${claim}`);

      const claimObject = JSON.parse(formatAleoString(claim));
      assert(claimObject.credits_amount === `${tokenAmount2.toString()}u128`, `Claim credits amount not set: ${claimObject.credits_amount}`);
      assert(claimObject.paleo_amount === `${tokenAmount2.toString()}u128`, `Claim paleo amount not set: ${claimObject.paleo_amount}`);
      assert(claimObject.recipient === withdrawAddress2, `Claim recipient not set: ${claimObject.recipient}`);
    });
  });

  describe('Cancel before MIN_CANCEL_HEIGHT', () => {
    it('Should not be able to cancel before MIN_CANCEL_HEIGHT', async () => {
      const txResult = await submitTransaction(
        NETWORK!,
        MULTI_SIG_PRIVATE_KEY_0!,
        tokenDisbursementProgram,
        'cancel',
        [claimId, `${tokenAmount2}u128`],
        4,
        undefined,
        resolvedImports
      );

      const wasAccepted = await isTransactionAccepted(txResult);
      assert(!wasAccepted, `cancel was accepted, but should have been rejected`);
    });
  });

  describe('Withdraw rewards', () => {
    it('Should be able to fund the withdrawal rewards and withdrawal principal addresses', async () => {
      const airDropResult = await airDropCredits(withdrawAddress, 1_000_000_000n);
      const airDropAccepted = await isTransactionAccepted(airDropResult);
      assert(airDropAccepted, `Air drop was rejected, but should have been accepted`);

      const airDropPrincipalResult = await airDropCredits(withdrawAddress2, 1_000_000_000n);
      const airDropPrincipalAccepted = await isTransactionAccepted(airDropPrincipalResult);
      assert(airDropPrincipalAccepted, `Air drop was rejected, but should have been accepted`);
    });

    it('Should not be able to withdraw rewards if no rewards', async () => {
      const txResult = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey,
        tokenDisbursementProgram,
        'withdraw_rewards',
        [claimId, '1u128'],
        4,
        undefined,
        resolvedImports
      );

      const wasAccepted = await isTransactionAccepted(txResult);
      assert(!wasAccepted, `withdraw_rewards was accepted, but should have been rejected due to no rewards`);
    });

    it('Should be able to withdraw rewards', async () => {
      // Airdrop to Pondo Protocol to simulate rewards
      const protocolTVL = await getPublicBalance(pondoProtocolAddress);
      console.log(`Protocol TVL: ${protocolTVL}`);
      const paleoSupply = await getMappingValue(PALEO_TOKEN_ID, 'token_registry.aleo', 'registered_tokens');
      console.log(`Paleo supply: ${paleoSupply}`);
      const airDropResult = await airDropCredits(pondoProtocolAddress, 200_000_000_000n);
      const airDropAccepted = await isTransactionAccepted(airDropResult);
      assert(airDropAccepted, `Air drop was rejected, but should have been accepted`);

      const expectedPaleoWithdrawLimit = tokenAmount / 2n;

      /**
       * Should not be able to withdraw too many paleo
       */
      const tooManyPaleo = expectedPaleoWithdrawLimit + 1n;
      const tooManyPaleoResult = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey,
        tokenDisbursementProgram,
        'withdraw_rewards',
        [claimId, `${tooManyPaleo.toString()}u128`],
        4,
        undefined,
        resolvedImports
      );

      const tooManyPaleoAccepted = await isTransactionAccepted(tooManyPaleoResult);
      assert(!tooManyPaleoAccepted, `withdraw_rewards was accepted, but should have been rejected due to too many paleo`);

      /**
       * Should not be able to withdraw paleo with wrong address
       */

      const wrongAddressResult = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey2,
        tokenDisbursementProgram,
        'withdraw_rewards',
        [claimId, `${expectedPaleoWithdrawLimit.toString()}u128`],
        4,
        undefined,
        resolvedImports
      );

      const wrongAddressAccepted = await isTransactionAccepted(wrongAddressResult);
      assert(!wrongAddressAccepted, `withdraw_rewards was accepted, but should have been rejected due to wrong address`);

      /**
       * Should not be able to withdraw paleo with for the wrong claim it
       */

      const wrongClaimResult = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey,
        tokenDisbursementProgram,
        'withdraw_rewards',
        [claimId2, `${expectedPaleoWithdrawLimit.toString()}u128`],
        4,
        undefined,
        resolvedImports
      );

      const wrongClaimAccepted = await isTransactionAccepted(wrongClaimResult);
      assert(!wrongClaimAccepted, `withdraw_rewards was accepted, but should have been rejected due to wrong claim`);

      /**
       * Should be able to withdraw rewards
       */

      console.log(`Withdrawing ${expectedPaleoWithdrawLimit} paleo...`);
      console.log(`Claim ID: ${claimId}`);
      const claimBefore = await getMappingValue(claimId, tokenDisbursementId, 'claims');
      console.log(`Claim before: ${claimBefore}`);

      const txResult = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey,
        tokenDisbursementProgram,
        'withdraw_rewards',
        [claimId, `${expectedPaleoWithdrawLimit.toString()}u128`],
        4,
        undefined,
        resolvedImports
      );

      const wasAccepted = await isTransactionAccepted(txResult);
      assert(wasAccepted, `withdraw_rewards was rejected, but should have been accepted`);

      const rewardsBalance = await getMTSPBalance(withdrawAddress, PALEO_TOKEN_ID, true);
      assert(rewardsBalance == expectedPaleoWithdrawLimit, `Rewards balance not set: ${rewardsBalance}`);

      const claim = await getMappingValue(claimId, tokenDisbursementId, 'claims');
      assert(claim, `Claim not found: ${claim}`);

      const claimObject = JSON.parse(formatAleoString(claim));
      assert(claimObject.credits_amount === `${tokenAmount.toString()}u128`, `Claim credits amount not set: ${claimObject.credits_amount}`);
      assert(claimObject.paleo_amount === `${tokenAmount - expectedPaleoWithdrawLimit}u128`, `Claim paleo amount not set: ${claimObject.paleo_amount}`);

      /**
       * Should not be able to withdraw rewards beyond the limit
       */
      const txResult2 = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey,
        tokenDisbursementProgram,
        'withdraw_rewards',
        [claimId, `1u128`],
        4,
        undefined,
        resolvedImports
      );

      const wasAccepted2 = await isTransactionAccepted(txResult2);
      assert(!wasAccepted2, `withdraw_rewards was accepted, but should have been rejected due to exceeding the limit`);
    });
  });

  describe('Time oracle', () => {
    it('Should not be able to withdraw principal before unlock time', async () => {
      const txResult = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey,
        tokenDisbursementProgram,
        'withdraw_principal',
        [claimId, `0u128`],
        4,
        undefined,
        resolvedImports
      );

      const wasAccepted = await isTransactionAccepted(txResult);
      assert(!wasAccepted, `withdraw_principal was accepted, but should have been rejected due to before unlock time`);
    });

    it('Should be able to update the time', async () => {
      const requestId = BigInt(Math.floor(Math.random() * 1_000_000_000));
      const newTime = '1757015687u64'; // One second after 1 year from genesis: 1_757_015_686
      const timeHash = Aleo.Plaintext.fromString(NETWORK!, newTime).hashBhp256();
      const plaintextString = `{
        arg: ${timeHash},
        op_type: 0u8,
        request_id: ${requestId}u64
      }`;
      const hashedField = Aleo.Plaintext.fromString(NETWORK!, plaintextString).hashBhp256();
  
      // Sign the hash with the oracle private keys
      const signature0 = Aleo.Signature.sign_plaintext(NETWORK!, MULTI_SIG_PRIVATE_KEY_0!, hashedField).to_string();
      const signature1 = Aleo.Signature.sign_plaintext(NETWORK!, MULTI_SIG_PRIVATE_KEY_1!, hashedField).to_string();
      const signature2 = Aleo.Signature.sign_plaintext(NETWORK!, MULTI_SIG_PRIVATE_KEY_2!, hashedField).to_string();

      /**
       * Should not be able to update the time with a signature from a non-admin
       */
      const wrongSignature = Aleo.Signature.sign_plaintext(NETWORK!, PRIVATE_KEY!, hashedField).to_string();
      const wrongAdminResult = await submitTransaction(
        NETWORK!,
        PRIVATE_KEY!,
        timeOracleProgram,
        'update_timestamp',
        [
          newTime,
          signature0,
          MULTI_SIG_ADDRESS_0!,
          signature1,
          MULTI_SIG_ADDRESS_1!,
          wrongSignature,
          ADDRESS!,
          `${requestId.toString()}u64`
        ],
        4
      );

      const wrongAdminAccepted = await isTransactionAccepted(wrongAdminResult);
      assert(!wrongAdminAccepted, `update_time was accepted, but should have been rejected due to wrong admin signature`);

      /**
       * Should not be able to update the time with a wrong signature
       */

      try {
        await submitTransaction(
          NETWORK!,
          PRIVATE_KEY!,
          timeOracleProgram,
          'update_timestamp',
          [
            newTime,
            signature0,
            MULTI_SIG_ADDRESS_0!,
            signature1,
            MULTI_SIG_ADDRESS_1!,
            wrongSignature,
            MULTI_SIG_ADDRESS_2!,
            `${requestId.toString()}u64`
          ],
          4
        );
        assert(false, `update_time was accepted, but should have been rejected due to wrong signature`);
      } catch (e) {
        console.log('Transaction failed as expected due to wrong signature');
      }

      /**
       * Should not be able to update the time with the wrong request id
       */

      try {
        await submitTransaction(
          NETWORK!,
          PRIVATE_KEY!,
          timeOracleProgram,
          'update_timestamp',
          [
            newTime,
            signature0,
            MULTI_SIG_ADDRESS_0!,
            signature1,
            MULTI_SIG_ADDRESS_1!,
            signature2,
            MULTI_SIG_ADDRESS_2!,
            `${(requestId + 1n).toString()}u64`
          ],
          4
        );
        assert(false, `update_time was accepted, but should have been rejected due to wrong request id`);
      } catch (e) {
        console.log('Transaction failed as expected due to wrong request id');
      }

      /**
       * Should not be able to update the time with the wrong time
       */

      try {
        await submitTransaction(
          NETWORK!,
          PRIVATE_KEY!,
          timeOracleProgram,
          'update_timestamp',
          [
            '1000u64',
            signature0,
            MULTI_SIG_ADDRESS_0!,
            signature1,
            MULTI_SIG_ADDRESS_1!,
            signature2,
            MULTI_SIG_ADDRESS_2!,
            `${requestId.toString()}u64`
          ],
          4
        );
        assert(false, `update_time was accepted, but should have been rejected due to wrong time`);
      } catch (e) {
        console.log('Transaction failed as expected due to wrong time');
      }

      /**
       * Should not be able to update the time with a duplicate signature
       */

      const duplicateSignature = Aleo.Signature.sign_plaintext(NETWORK!, MULTI_SIG_PRIVATE_KEY_0!, hashedField).to_string();
      try {
        await submitTransaction(
          NETWORK!,
          PRIVATE_KEY!,
          timeOracleProgram,
          'update_timestamp',
          [
            newTime,
            signature0,
            MULTI_SIG_ADDRESS_0!,
            duplicateSignature,
            MULTI_SIG_ADDRESS_0!,
            signature2,
            MULTI_SIG_ADDRESS_2!,
            `${requestId.toString()}u64`
          ],
          4
        );
        assert(false, `update_time was accepted, but should have been rejected due to duplicate signature`);
      } catch (e) {
        console.log('Transaction failed as expected due to duplicate signature');
      }

      /**
       * Should be able to update the time with the correct signatures
       */

      const txResult = await submitTransaction(
        NETWORK!,
        PRIVATE_KEY!,
        timeOracleProgram,
        'update_timestamp',
        [
          newTime,
          signature0,
          MULTI_SIG_ADDRESS_0!,
          signature1,
          MULTI_SIG_ADDRESS_1!,
          signature2,
          MULTI_SIG_ADDRESS_2!,
          `${requestId.toString()}u64`
        ],
        4
      );

      const wasAccepted = await isTransactionAccepted(txResult);
      assert(wasAccepted, `update_time was rejected, but should have been accepted`);

      const timeOracleTimestamp = await getMappingValue('0u8', timeOracleId, 'timestamp');
      assert(timeOracleTimestamp == newTime, `Time Oracle timestamp not updated from ${timeOracleTimestamp} to ${newTime}`);
    });
  });

  describe('Withdraw principal', () => {
    it('Should not be able to withdraw rewards after unlock time', async () => {
      const txResult = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey,
        tokenDisbursementProgram,
        'withdraw_rewards',
        [claimId, `0u128`],
        4,
        undefined,
        resolvedImports
      );

      const wasAccepted = await isTransactionAccepted(txResult);
      assert(!wasAccepted, `withdraw_rewards was accepted, but should have been rejected due to after unlock time`);
    });

    it('Should be able to withdraw principal', async () => {
      const expectedPaleoWithdrawLimit = (tokenAmount / 2n);

      /**
       * Should not be able to withdraw too many paleo
       */
      const tooManyPaleo = expectedPaleoWithdrawLimit + 10_000n;
      const tooManyPaleoResult = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey,
        tokenDisbursementProgram,
        'withdraw_principal',
        [claimId, `${tooManyPaleo.toString()}u128`],
        4,
        undefined,
        resolvedImports
      );

      const tooManyPaleoAccepted = await isTransactionAccepted(tooManyPaleoResult);
      assert(!tooManyPaleoAccepted, `withdraw_principal was accepted, but should have been rejected due to too many paleo`);

      /**
       * Should not be able to withdraw paleo with wrong address
       */
      const wrongAddressResult = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey2,
        tokenDisbursementProgram,
        'withdraw_principal',
        [claimId, `${expectedPaleoWithdrawLimit.toString()}u128`],
        4,
        undefined,
        resolvedImports
      );

      const wrongAddressAccepted = await isTransactionAccepted(wrongAddressResult);
      assert(!wrongAddressAccepted, `withdraw_principal was accepted, but should have been rejected due to wrong address`);

      /**
       * Should not be able to withdraw paleo with for the wrong claim it
       */
      const wrongClaimResult = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey,
        tokenDisbursementProgram,
        'withdraw_principal',
        [claimId2, `${expectedPaleoWithdrawLimit.toString()}u128`],
        4,
        undefined,
        resolvedImports
      );

      const wrongClaimAccepted = await isTransactionAccepted(wrongClaimResult);
      assert(!wrongClaimAccepted, `withdraw_principal was accepted, but should have been rejected due to wrong claim`);

      /**
       * Should be able to withdraw principal
       */
      const txResult = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey,
        tokenDisbursementProgram,
        'withdraw_principal',
        [claimId, `${expectedPaleoWithdrawLimit.toString()}u128`],
        4,
        undefined,
        resolvedImports
      );

      const wasAccepted = await isTransactionAccepted(txResult);
      assert(wasAccepted, `withdraw_principal was rejected, but should have been accepted`);

      const principalBalance = await getMTSPBalance(withdrawAddress, PALEO_TOKEN_ID, true);
      assert(principalBalance == tokenAmount, `Principal balance not set: ${principalBalance}`);

      const claim = await getMappingValue(claimId, tokenDisbursementId, 'claims');
      assert(claim, `Claim not found: ${claim}`);

      const claimObject = JSON.parse(formatAleoString(claim));
      assert(claimObject.credits_amount === `${tokenAmount.toString()}u64`, `Claim credits amount not set: ${claimObject.credits_amount}`);
      assert(claimObject.paleo_amount === `0u128`, `Claim paleo amount not set: ${claimObject.paleo_amount}`);

      /**
       * Should not be able to withdraw principal beyond the limit
       */
      const txResult2 = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey,
        tokenDisbursementProgram,
        'withdraw_principal',
        [claimId, `1u128`],
        4,
        undefined,
        resolvedImports
      );

      const wasAccepted2 = await isTransactionAccepted(txResult2);
      assert(!wasAccepted2, `withdraw_principal was accepted, but should have been rejected due to exceeding the vested limit`);
    });
  });

  describe('Cancel', () => {
    it('Should not be able with wrong amount', async () => {
      const blockHeight = await getHeight();
      console.log(`Current block height: ${blockHeight}`);

      const balanceBefore = await getMTSPBalance(adminAddress, PALEO_TOKEN_ID, true);

      const cancelResult = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey,
        tokenDisbursementProgram,
        'cancel',
        [claimId2, `${tokenAmount2 + 1n}u128`],
        4,
        undefined,
        resolvedImports
      );

      const cancelAccepted = await isTransactionAccepted(cancelResult);
      assert(!cancelAccepted, `Cancel was accepted, but should have been rejected`);

      const balanceAfter = await getMTSPBalance(adminAddress, PALEO_TOKEN_ID, true);
      assert(balanceAfter == balanceBefore, `Admin balance not set: ${balanceAfter}`);
    });

    it('Should be able to cancel after ', async () => {
      const blockHeight = await getHeight();
      console.log(`Current block height: ${blockHeight}`);

      const balanceBefore = await getMTSPBalance(adminAddress, PALEO_TOKEN_ID, true);

      const cancelResult = await submitTransaction(
        NETWORK!,
        withdrawPrivateKey,
        tokenDisbursementProgram,
        'cancel',
        [claimId2, `${tokenAmount2}u128`],
        4,
        undefined,
        resolvedImports
      );

      const cancelAccepted = await isTransactionAccepted(cancelResult);
      assert(cancelAccepted, `Cancel was rejected, but should have been accepted`);

      const balanceAfter = await getMTSPBalance(adminAddress, PALEO_TOKEN_ID, true);
      const expectedBalance = balanceBefore - tokenAmount2;
      assert(balanceAfter == expectedBalance, `Admin balance should be ${expectedBalance} but is ${balanceAfter}`);
    });
  });
});