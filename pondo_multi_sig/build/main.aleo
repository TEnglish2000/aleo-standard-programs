import credits.aleo;
import token_registry.aleo;
program pondo_multi_sig.aleo;


struct TokenMetadata:
    token_id as field;
    name as u128;
    symbol as u128;
    decimals as u8;
    supply as u128;
    max_supply as u128;
    admin as address;
    external_authorization_required as boolean;
    external_authorization_party as address;

struct TokenOwner:
    account as address;
    token_id as field;


struct transfer_operation:
    token_id as field;
    recipient as address;
    amount as u128;
    program_id as address;

struct admin_operation:
    arg as field;
    op_type as u8;
    request_id as u64;


mapping admin_operations:
	key as u64.public;
	value as admin_operation.public;


mapping admins:
	key as address.public;
	value as boolean.public;


mapping initialized:
	key as u8.public;
	value as boolean.public;


function initialize:
    async initialize into r0;
    output r0 as pondo_multi_sig.aleo/initialize.future;

finalize initialize:
    contains initialized[0u8] into r0;
    not r0 into r1;
    assert.eq r1 true;
    set true into initialized[0u8];
    set true into admins[aleo12shtwnmf49t5atmad2jnk3e58ahtp749d9trctt9z3wryxyzt5pspp0nd0];
    set true into admins[aleo1z9y9afh0h6dnyj3f0hvjc4mhayjy06fj42ppcq0rvpmmyky6fuzs449sjr];
    set true into admins[aleo19x0ctad8llm9y0qssw7eup045c5wxxp6k4al3n0d5r8maulkzu8sh3jwew];
    set true into admins[aleo16ycrg9g4208lp5y4g5s3gn43xknc5gdsr7wjrpqq9htznj5qk5yqd6px5a];
    set true into admins[aleo1q59hxe2zmexlu4vgtmtmvyxm4ew047zlf50h5l5zsrdvljusdvrqn78u7s];




function transfer:
    input r0 as field.public;
    input r1 as address.public;
    input r2 as u128.public;
    input r3 as signature.public;
    input r4 as address.public;
    input r5 as signature.public;
    input r6 as address.public;
    input r7 as signature.public;
    input r8 as address.public;
    input r9 as u64.public;
    call token_registry.aleo/transfer_public r0 r1 r2 into r10;
    cast r0 r1 r2 pondo_multi_sig.aleo into r11 as transfer_operation;
    hash.bhp256 r11 into r12 as field;
    cast r12 0u8 r9 into r13 as admin_operation;
    hash.bhp256 r13 into r14 as field;
    sign.verify r3 r4 r14 into r15;
    sign.verify r5 r6 r14 into r16;
    sign.verify r7 r8 r14 into r17;
    and r15 r16 into r18;
    and r18 r17 into r19;
    assert.eq r19 true;
    assert.neq r4 r6;
    assert.neq r4 r8;
    assert.neq r6 r8;
    async transfer r10 r4 r6 r8 r13 into r20;
    output r20 as pondo_multi_sig.aleo/transfer.future;

finalize transfer:
    input r0 as token_registry.aleo/transfer_public.future;
    input r1 as address.public;
    input r2 as address.public;
    input r3 as address.public;
    input r4 as admin_operation.public;
    await r0;
    get admins[r1] into r5;
    get admins[r2] into r6;
    get admins[r3] into r7;
    and r5 r6 into r8;
    and r8 r7 into r9;
    assert.eq r9 true;
    contains admin_operations[r4.request_id] into r10;
    assert.eq r10 false;
    set r4 into admin_operations[r4.request_id];




function update_admin:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as signature.public;
    input r3 as address.public;
    input r4 as signature.public;
    input r5 as address.public;
    input r6 as signature.public;
    input r7 as address.public;
    input r8 as u64.public;
    cast  r0 r1 pondo_multi_sig.aleo into r9 as [address; 3u32];
    hash.bhp256 r9 into r10 as field;
    cast r10 1u8 r8 into r11 as admin_operation;
    hash.bhp256 r11 into r12 as field;
    sign.verify r2 r3 r12 into r13;
    sign.verify r4 r5 r12 into r14;
    sign.verify r6 r7 r12 into r15;
    and r13 r14 into r16;
    and r16 r15 into r17;
    assert.eq r17 true;
    assert.neq r3 r5;
    assert.neq r3 r7;
    assert.neq r5 r7;
    async update_admin r0 r1 r3 r5 r7 r11 into r18;
    output r18 as pondo_multi_sig.aleo/update_admin.future;

finalize update_admin:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as address.public;
    input r3 as address.public;
    input r4 as address.public;
    input r5 as admin_operation.public;
    get admins[r2] into r6;
    get admins[r3] into r7;
    get admins[r4] into r8;
    and r6 r7 into r9;
    and r9 r8 into r10;
    assert.eq r10 true;
    contains admin_operations[r5.request_id] into r11;
    assert.eq r11 false;
    set r5 into admin_operations[r5.request_id];
    remove admins[r0];
    set true into admins[r1];

