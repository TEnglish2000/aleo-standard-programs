import pondo_protocol.aleo;
import time_oracle.aleo;
import token_registry.aleo;

// The 'pondo_multi_sig' program.
program token_disbursement.aleo {
    // The cold address for funds to be returned to in the event of a cancel
    const ADMIN_COLD_KEY: address = aleo12shtwnmf49t5atmad2jnk3e58ahtp749d9trctt9z3wryxyzt5pspp0nd0;
    // The unlock timestamp for all of the distributions, 9/4/2025
    const UNLOCK_TIMESTAMP: u64 = 1_757_015_686u64;
    // Minimum cancel block height, approximately 2 years after genesis
    const MIN_CANCEL_HEIGHT: u32 = 22_500_000u32;

    struct Claim {
      credits_amount: u128, // The amount of Aleo credits to be distributed
      paleo_amount: u128, // The amount of paleo to be distributed
      recipient: address, // The recipient of the claim
    }

    // Mapping to store the claims
    mapping claims: u64 => Claim;

    /**
     * Create a new claim
     * @param claim_id The ID of the claim, must be unique
     * @param paleo_amount The amount of Aleo credits to be distributed
     * @param recipient The recipient of the claim
     * Note: The credits amount is the same as the paleo amount even though pAleo > Aleo
     * This means that some rewards are immediately withdrawable = (pAleo/Aleo - 1) * paleo_amount
     */
    async transition create(
      public claim_id: u64,
      public paleo_amount: u128,
      public recipient: address
    ) -> Future {
      // Transfer the pAleo to the recipient
      let f0: Future = token_registry.aleo/transfer_public_as_signer(PALEO_TOKEN_ID, self.address, paleo_amount);
      // Finalize the creation
      return finalize_create(f0, claim_id, paleo_amount, recipient);
    }

    async function finalize_create(
      f0: Future,
      public claim_id: u64,
      public paleo_amount: u128,
      public recipient: address
    ) {
      f0.await();

      // Ensure the claim does not already exist
      let claim_exists: bool = claims.contains(claim_id);
      assert(!claim_exists);

      // Create the claim with credits amount set to the paleo amount
      let claim: Claim = Claim {
        credits_amount: paleo_amount,
        paleo_amount: paleo_amount,
        recipient: recipient
      };
      claims.set(claim_id, claim);
    }

    async transition withdraw_rewards(
      public claim_id: u64,
      public paleo_amount: u128
    ) -> Future {
      let f0: Future = token_registry.aleo/transfer_public(PALEO_TOKEN_ID, self.caller, paleo_amount);
      return finalize_withdraw_rewards(f0, claim_id, paleo_amount, self.caller);
    }

    async function finalize_withdraw_rewards(
      public f0: Future,
      public claim_id: u64,
      public paleo_amount: u128,
      public caller: address
    ) {
      // Await the transfer completing
      f0.await();

      // Get the claim
      let claim: Claim = claims.get(claim_id);

      // Ensure the caller is the recipient
      assert_eq(caller, claim.recipient);

      // Get the current timestamp
      let current_timestamp: u64 = time_oracle.aleo/timestamp.get(0u8);
      // Assert that the current timestamp is before the cliff
      assert(current_timestamp < UNLOCK_TIMESTAMP);

      // Subtract the amount from the claim
      let remaining_paleo: u128 = claim.paleo_amount - paleo_amount;

      // Assert Pondo not in rebalancing state
      let current_state: u8 = pondo_protocol.aleo/protocol_state.get(PROTOCOL_STATE_KEY);
      assert(current_state != REBALANCING_STATE);

      // Ensure the number of credits in the principal remains above the initial deposit
      // Note: the paleo pool and the credits pool are always an underestimate (assuming no slashing) as it does not include rewards & owed commissions
      // We use this underestimate because it as significantly reduces gas costs and should be close to the actual amount
      // As it is an underestimate, the downside is it will slightly reduce the amount of paleo that can be withdrawn
      let minted_paleo: u128 = token_registry.aleo/registered_tokens.get(PALEO_TOKEN_ID).supply;
      let paleo_commission: u64 = pondo_protocol.aleo/owed_commission.get(0u8);
      let total_paleo_pool: u128 = minted_paleo + paleo_commission as u128;
      let delegated_credits: u64 = pondo_protocol.aleo/balances.get(DELEGATED_BALANCE);
      let core_protocol_account: u64 = credits.aleo/account.get_or_use(pondo_protocol.aleo, 0u64);
      let reserved_for_withdrawal: u64 = pondo_protocol.aleo/balances.get(CLAIMABLE_WITHDRAWALS);
      let total_credits_pool: u64 = delegated_credits + core_protocol_account - reserved_for_withdrawal;

      let claim_credits_balance: u128 = total_credits_pool as u128 * remaining_paleo / total_paleo_pool;
      assert(claim_credits_balance >= claim.credits_amount as u128);

      // Update the claim
      let updated_claim: Claim = Claim {
        credits_amount: claim.credits_amount,
        paleo_amount: remaining_paleo,
        recipient: claim.recipient,
      };
      claims.set(claim_id, updated_claim);
    }

    async transition withdraw_principal(
      public claim_id: u64,
      public paleo_amount: u128
    ) -> Future {
      let f0: Future = token_registry.aleo/transfer_public(PALEO_TOKEN_ID, self.caller, paleo_amount);
      return finalize_withdraw_principal(f0, claim_id, paleo_amount, self.caller);
    }

    async function finalize_withdraw_principal(
      public f0: Future,
      public claim_id: u64,
      public paleo_amount: u128,
      public caller: address
    ) {
      // Await the transfer completing
      f0.await();

      // Get the claim
      let claim: Claim = claims.get(claim_id);

      // Ensure the caller is the recipient
      assert_eq(caller, claim.recipient);

      // Get the current timestamp
      let current_timestamp: u64 = time_oracle.aleo/timestamp.get(0u8);
      // Assert that the current timestamp is after the cliff
      assert(current_timestamp >= UNLOCK_TIMESTAMP);

      // Subtract the amount from the claim
      let remaining_paleo: u128 = claim.paleo_amount - paleo_amount;

      // Update the claim
      let updated_claim: Claim = Claim {
        credits_amount: claim.credits_amount,
        paleo_amount: remaining_paleo,
        recipient: claim.recipient,
      };
      claims.set(claim_id, updated_claim);
    }

    async transition cancel(
      public claim_id: u64,
      public paleo_amount: u128
    ) -> Future {
      let f0: Future = token_registry.aleo/transfer_public(PALEO_TOKEN_ID, ADMIN_COLD_KEY, paleo_amount);
      return finalize_cancel(f0, claim_id, paleo_amount);
    }

    async function finalize_cancel(
      public f0: Future,
      public claim_id: u64,
      public paleo_amount: u128
    ) {
      // Await the transfer completing
      f0.await();

      // Assert that the current timestamp is after the minimum cancel height
      assert(block.height > MIN_CANCEL_HEIGHT);

      // Get the claim
      let claim: Claim = claims.get(claim_id);
      // Assert that the transfer amount is the remaining pAleo
      assert_eq(claim.paleo_amount, paleo_amount);

      // Remove the claim
      claims.remove(claim_id);
    }

    // Copied from pondo_protocol_token.aleo
    const PALEO_TOKEN_ID: field = 1751493913335802797273486270793650302076377624243810059080883537084141842600field;
    // Copied from pondo_protocol.aleo
    const PROTOCOL_STATE_KEY: u8 = 0u8;
    const REBALANCING_STATE: u8 = 2u8;
    const DELEGATED_BALANCE: u8 = 0u8;
    const CLAIMABLE_WITHDRAWALS: u8 = 2u8;
}