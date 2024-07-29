import * as Aleo from '@demox-labs/aleo-sdk';

import { getMappingValue, getProgram, getPublicBalance } from '../aleo/client';
import { submitTransaction } from '../aleo/execute';
import { resolveImports } from '../aleo/deploy';
import {
  CREDITS_PROGRAM,
  NETWORK,
  PALEO_TOKEN_ID,
  PONDO_COMMISSION,
  PRECISION_UNSIGNED,
  PRIVATE_KEY,
  ZERO_ADDRESS,
} from '../constants';
import { PONDO_PROTOCOL_STATE } from './types';
import { formatAleoString } from '../util';
import {
  pondoDependencyTree,
  pondoPrograms,
  pondoProgramToCode,
} from '../compiledPrograms';

const MTSP_PROGRAM = pondoPrograms.find((program) =>
  program.includes('multi_token_support_program')
);
const CORE_PROTOCOL_PROGRAM = pondoPrograms.find((program) =>
  program.includes('pondo_core_protocol')
)!;
const CORE_PROTOCOL_PROGRAM_CODE = pondoProgramToCode[CORE_PROTOCOL_PROGRAM];

////// DEPOSIT //////

export const depositAsSigner = async (deposit: bigint, privateKey?: string) => {
  const paleoForDeposit =
    (await calculatePaleoForDeposit(deposit)) - BigInt(1000);
  const imports = pondoDependencyTree[CORE_PROTOCOL_PROGRAM];
  const resolvedImports = await resolveImports(imports);

  await submitTransaction(
    NETWORK!,
    privateKey || PRIVATE_KEY!,
    CORE_PROTOCOL_PROGRAM_CODE,
    'deposit_public_as_signer',
    [`${deposit}u64`, `${paleoForDeposit}u64`, ZERO_ADDRESS],
    3,
    undefined,
    resolvedImports
  );
};

const calculatePaleoForDeposit = async (deposit: bigint): Promise<bigint> => {
  let totalProtocolBalance = BigInt(0);
  // Handle updating all of the delegators
  for (let index = 1; index < 6; index++) {
    const delegatorProgramId = `pondo_delegator${index}.aleo`;
    const delegatorProgram = await getProgram(delegatorProgramId);
    const delegatorProgramAddress = Aleo.Program.fromString(
      NETWORK!,
      delegatorProgram
    ).toAddress();
    totalProtocolBalance += await getPublicBalance(delegatorProgramAddress);
    const bondedState = await getMappingValue(
      delegatorProgramAddress,
      CREDITS_PROGRAM,
      'bonded'
    );
    if (bondedState) {
      totalProtocolBalance += BigInt(
        JSON.parse(formatAleoString(bondedState))['microcredits'].slice(0, -3)
      );
    }
    const unbondingState = await getMappingValue(
      delegatorProgramAddress,
      CREDITS_PROGRAM,
      'unbonding'
    );
    if (unbondingState) {
      totalProtocolBalance += BigInt(
        JSON.parse(formatAleoString(unbondingState))['microcredits'].slice(
          0,
          -3
        )
      );
    }
  }
  const lastDelegatedBalanceString = await getMappingValue(
    '0u8',
    CORE_PROTOCOL_PROGRAM!,
    'balances'
  );
  const lastDelegatedBalance = BigInt(lastDelegatedBalanceString.slice(0, -3));
  const earnedRewards =
    totalProtocolBalance > lastDelegatedBalance
      ? totalProtocolBalance - lastDelegatedBalance
      : BigInt(0);
  const earnedCommission =
    (earnedRewards * PONDO_COMMISSION) / PRECISION_UNSIGNED;
  console.log('Earned commission: ', earnedCommission);
  const nonCommissionedRewards = earnedRewards - earnedCommission;
  console.log('Non-commissioned rewards: ', nonCommissionedRewards);

  const reservedForWithdrawalsString = await getMappingValue(
    '2u8',
    CORE_PROTOCOL_PROGRAM!,
    'balances'
  );
  const reservedForWithdrawals = BigInt(
    reservedForWithdrawalsString.slice(0, -3)
  );
  const coreProtocolAccountBalance = await getPublicBalance(
    CORE_PROTOCOL_PROGRAM!
  );
  const protocolState = await getMappingValue(
    '0u8',
    CORE_PROTOCOL_PROGRAM,
    'protocol_state'
  );
  const depositPool =
    protocolState == PONDO_PROTOCOL_STATE.REBALANCING
      ? coreProtocolAccountBalance -
        lastDelegatedBalance -
        reservedForWithdrawals
      : coreProtocolAccountBalance - reservedForWithdrawals;
  console.log('Deposit pool: ', depositPool);
  let totalAleo = lastDelegatedBalance + depositPool;
  console.log('Last delegated balance: ', lastDelegatedBalance);

  const paleoMetadata = await getMappingValue(
    PALEO_TOKEN_ID,
    MTSP_PROGRAM,
    'registered_tokens'
  );
  const mintedPaleo = BigInt(
    JSON.parse(formatAleoString(paleoMetadata))['supply'].slice(0, -4)
  );
  const owedCommissionString = await getMappingValue(
    '0u8',
    CORE_PROTOCOL_PROGRAM!,
    'owed_commission'
  );
  const owedComission = BigInt(owedCommissionString.slice(0, -3));
  console.log('Owed commission: ', owedComission);
  console.log('Minted paleo: ', mintedPaleo);
  const totalPaleo = mintedPaleo + owedComission;

  const paleoForCommission = calculatePaleoMint(
    totalAleo + nonCommissionedRewards,
    totalPaleo,
    earnedCommission
  );
  console.log('Paleo for commission: ', paleoForCommission);

  totalAleo += nonCommissionedRewards;
  const paleoAfterCommission =
    (totalPaleo * (totalAleo + earnedCommission)) / totalAleo;
  const aleoAfterCommission = totalAleo + earnedCommission;
  console.log('Aleo after commission: ', aleoAfterCommission); // TODO: add buffer for additional rewards earned in the interceding blocks
  console.log('Paleo after commission: ', paleoAfterCommission);

  return calculatePaleoMint(aleoAfterCommission, paleoAfterCommission, deposit);
};

const calculatePaleoMint = (
  totalAleo: bigint,
  totalPaleo: bigint,
  deposit: bigint
) => {
  let newTotalPaleo: bigint = (totalPaleo * (totalAleo + deposit)) / totalAleo;
  let diff: bigint = newTotalPaleo - totalPaleo;
  let paleoToMint: bigint = BigInt.asUintN(64, diff);
  console.log('Paleo to mint: ', paleoToMint);
  return paleoToMint;
};

////// WITHDRAW //////
export const instantWithdraw = async (withdrawalPaleo: bigint) => {};

export const calculateAleoForWithdrawal = async (withdrawalPaleo: bigint) => {};