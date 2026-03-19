import { describe, it, expect, vi } from 'vitest';
import { A2AChannel } from '../a2a.js';
import { wrapLangChainTool } from '../adapters/a2a-langchain.js';
import { Session } from '../session.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed25519.etc.sha512Sync = sha512;

function makeAgent() {
  const privKey = ed25519.utils.randomPrivateKey();
  const pubKey = ed25519.getPublicKey(privKey);
  return {
    privateKey: Buffer.from(privKey).toString('hex'),
    publicKey: Buffer.from(pubKey).toString('hex'),
  };
}

describe('wrapLangChainTool', () => {
  const agentA = makeAgent();

  it('records only the outbound handoff for unsigned tool responses', async () => {
    const enqueue = vi.fn();
    const session = new Session('agent-a', 'langchain-test', agentA.privateKey, enqueue);
    const channel = new A2AChannel(session, 'agent-a', agentA.privateKey);

    const originalCall = vi.fn().mockResolvedValue('done');
    const tool = {
      _call: originalCall,
    };

    const wrapped = wrapLangChainTool(tool, {
      channel,
      receiverAgent: 'agent-b',
    });

    const result = await wrapped._call('some input');

    expect(result).toBe('done');
    expect(originalCall).toHaveBeenCalledWith('some input');
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0].action).toBe('a2a_send');
    expect(enqueue.mock.calls[0][0].input.protocol).toBe('langchain');
    expect(enqueue.mock.calls[0][0].input.adapter).toBe('langchain_tool');
  });
});
