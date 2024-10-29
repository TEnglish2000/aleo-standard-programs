import token_registry.aleo;

// The 'pondo_multi_sig' program.
program pondo_multi_sig.aleo {
    // Admins responsible for approving transfers
    const ADMIN_0: address = aleo12shtwnmf49t5atmad2jnk3e58ahtp749d9trctt9z3wryxyzt5pspp0nd0;
    const ADMIN_1: address = aleo1z9y9afh0h6dnyj3f0hvjc4mhayjy06fj42ppcq0rvpmmyky6fuzs449sjr;
    const ADMIN_2: address = aleo19x0ctad8llm9y0qssw7eup045c5wxxp6k4al3n0d5r8maulkzu8sh3jwew;
    const ADMIN_3: address = aleo16ycrg9g4208lp5y4g5s3gn43xknc5gdsr7wjrpqq9htznj5qk5yqd6px5a;
    const ADMIN_4: address = aleo1q59hxe2zmexlu4vgtmtmvyxm4ew047zlf50h5l5zsrdvljusdvrqn78u7s;
    
    struct transfer_operation {
      token_id: field,
      recipient: address,
      amount: u128
    }

    struct admin_operation {
      arg: field,
      op_type: u8,
      request_id: u64,
      program_id: address
    }

    // The admin operation types
    const TRANSFER_OPERATION: u8 = 0u8;
    const UPDATE_ADMIN_OPERATION: u8 = 1u8;

    // Mapping to store executed admin operations by request ID
    mapping admin_operations: u64 => admin_operation;
    mapping admins: address => bool;
    mapping initialized: u8 => bool;

    // Initialize the contract with predefined admins
    async transition initialize() -> Future {
      return finalize_initialize();
    }

    async function finalize_initialize() {
      // Ensure the contract isn't already initialized
      let is_initialized: bool = initialized.contains(0u8);
      assert(!is_initialized);
      initialized.set(0u8, true);

      // Set the initial admins
      admins.set(ADMIN_0, true);
      admins.set(ADMIN_1, true);
      admins.set(ADMIN_2, true);
      admins.set(ADMIN_3, true);
      admins.set(ADMIN_4, true);
    }

    // Transfer method with multisig approval logic
    async transition transfer(
      public token_id: field,
      public recipient: address,
      public amount: u128,
      public sig_1: signature,
      public admin_1: address,
      public sig_2: signature,
      public admin_2: address,
      public sig_3: signature,
      public admin_3: address,
      public request_id: u64
    ) -> Future {
      // Transfer the tokens
      let transfer_future: Future = token_registry.aleo/transfer_public(token_id, recipient, amount);

      let transfer_op: transfer_operation = transfer_operation {
        token_id: token_id,
        recipient: recipient,
        amount: amount
      };
      let transfer_hash: field = BHP256::hash_to_field(transfer_op);
      let admin_op: admin_operation = admin_operation {
        arg: transfer_hash,
        op_type: TRANSFER_OPERATION,
        request_id: request_id,
        program_id: self.address
      };
      let op_hash: field = BHP256::hash_to_field(admin_op);

      // Verify all three signatures
      let is_verified_1: bool = sig_1.verify(admin_1, op_hash);
      let is_verified_2: bool = sig_2.verify(admin_2, op_hash);
      let is_verified_3: bool = sig_3.verify(admin_3, op_hash);
      assert(is_verified_1 && is_verified_2 && is_verified_3);

      // Ensure the admin addresses are not the same
      assert_neq(admin_1, admin_2);
      assert_neq(admin_1, admin_3);
      assert_neq(admin_2, admin_3);

      return finalize_transfer(transfer_future, admin_1, admin_2, admin_3, admin_op);
  }

    async function finalize_transfer(
      public transfer_future: Future,
      public admin_1: address,
      public admin_2: address,
      public admin_3: address,
      public admin_op: admin_operation,
    ) {
      transfer_future.await();

      /* Start Verify Transfer Operation */

      // Ensure each admin is registered
      let is_admin_1: bool = admins.get(admin_1);
      let is_admin_2: bool = admins.get(admin_2);
      let is_admin_3: bool = admins.get(admin_3);
      assert(is_admin_1 && is_admin_2 && is_admin_3);

      // Ensure the request hasn't been executed before
      let request_exists: bool = admin_operations.contains(admin_op.request_id);
      assert_eq(request_exists, false);

      // Store the transfer operation
      admin_operations.set(admin_op.request_id, admin_op);

      /* End Verify Transfer Operation */
    }

    // Used for the multi-sig to update an admin addresses
  async transition update_admin(
    public old_admin: address,
    public new_admin: address,
    public sig_1: signature,
    public admin_1: address,
    public sig_2: signature,
    public admin_2: address,
    public sig_3: signature,
    public admin_3: address,
    public request_id: u64
  ) -> Future {
    let args: [address; 2] = [old_admin, new_admin];
    let arg: field = BHP256::hash_to_field(args);
    let admin_op: admin_operation = admin_operation {
      arg: arg,
      op_type: UPDATE_ADMIN_OPERATION,
      request_id: request_id,
      program_id: self.address
    };
    let op_hash: field = BHP256::hash_to_field(admin_op);
    let is_verified_1: bool = sig_1.verify(admin_1, op_hash);
    let is_verified_2: bool = sig_2.verify(admin_2, op_hash);
    let is_verified_3: bool = sig_3.verify(admin_3, op_hash);
    assert(is_verified_1 && is_verified_2 && is_verified_3);

    // Ensure the admin addresses are not the same
    assert_neq(admin_1, admin_2);
    assert_neq(admin_1, admin_3);
    assert_neq(admin_2, admin_3);

    return finalize_update_admin(old_admin, new_admin, admin_1, admin_2, admin_3, admin_op);
  }

  async function finalize_update_admin(
    public old_admin: address,
    public new_admin: address,
    public admin_1: address,
    public admin_2: address,
    public admin_3: address,
    public admin_op: admin_operation
  ) {
    /* Start Verify Admin Operation */

    // Ensure the admin addresses are each admins
    let is_admin_1: bool = admins.get(admin_1);
    let is_admin_2: bool = admins.get(admin_2);
    let is_admin_3: bool = admins.get(admin_3);
    assert(is_admin_1 && is_admin_2 && is_admin_3);

    // Ensure the request hasn't been made before
    let request_exists: bool = admin_operations.contains(admin_op.request_id);
    assert_eq(request_exists, false);

    // Set the admin operation
    admin_operations.set(admin_op.request_id, admin_op);

    /* End Verify Admin Operation */

    let is_removing_admin: bool = admins.contains(old_admin);
    assert(is_removing_admin);

    // Remove the old admin
    admins.remove(old_admin);

    // Ensure new admin is not already an admin
    let is_existing_admin: bool = admins.contains(new_admin);
    assert(!is_existing_admin);

    // Set the new admin
    admins.set(new_admin, true);
  }
}
