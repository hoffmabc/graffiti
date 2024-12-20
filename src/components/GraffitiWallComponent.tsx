import React, { useState, useEffect, useCallback } from 'react';
import { RpcConnection, MessageUtil, PubkeyUtil, Instruction, Message } from '@saturnbtcio/arch-sdk';
import { Copy, Check, AlertCircle, Globe, Github, Network } from 'lucide-react';
import { Buffer } from 'buffer';
import { useWallet } from '../hooks/useWallet';
import * as borsh from 'borsh';
import AnimatedBackground from './AnimatedBackground';


// Configure global Buffer for browser environment
window.Buffer = Buffer;

// Environment variables for configuration
const client = new RpcConnection((import.meta as any).env.VITE_RPC_URL || '/api');
const PROGRAM_PUBKEY = (import.meta as any).env.VITE_PROGRAM_PUBKEY;
const WALL_ACCOUNT_PUBKEY = (import.meta as any).env.VITE_WALL_ACCOUNT_PUBKEY;

class GraffitiMessage {
  constructor(
    public timestamp: number,
    public name: string,
    public message: string
  ) {}

  static schema = new Map([
    [
      GraffitiMessage,
      {
        kind: 'struct',
        fields: [
          ['timestamp', 'i64'],
          ['name', ['u8', 16]],
          ['message', ['u8', 64]]
        ]
      }
    ]
  ]);
}

// Define the schema for the wall containing messages
class GraffitiWall {
  constructor(public messages: GraffitiMessage[]) {}

  static schema = new Map([
    [
      GraffitiWall,
      {
        kind: 'struct',
        fields: [
          ['messages', [GraffitiMessage]]
        ]
      }
    ]
  ]);
}



const GraffitiWallComponent = () => {

  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  // State management
  const wallet = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [isAccountCreated, setIsAccountCreated] = useState(false);
  const [isProgramDeployed, setIsProgramDeployed] = useState(false);
  const [wallData, setWallData] = useState<GraffitiMessage[]>([]);
  
  // Form state
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [isFormValid, setIsFormValid] = useState(false);
  const [copied, setCopied] = useState(false);

  const addDebugLog = (message: string) => {
    setDebugInfo(prev => [...prev.slice(-4), message]); // Keep last 5 messages
  };

  // Convert account pubkey once
  const accountPubkey = PubkeyUtil.fromHex(WALL_ACCOUNT_PUBKEY);

  const schema = {
    struct: {
      messages: {
        seq: {
          struct: {
            timestamp: 'i64',
            name: { array: { type: 'u8', len: 16 } },
            message: { array: { type: 'u8', len: 64 } }
          }
        }
      }
    }
  };

  // Utility Functions
  const copyToClipboard = () => {
    navigator.clipboard.writeText(`arch-cli account create --name <unique_name> --program-id ${PROGRAM_PUBKEY}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Check if the program is deployed on the network
  const checkProgramDeployed = useCallback(async () => {
    try {
      const pubkeyBytes = PubkeyUtil.fromHex(PROGRAM_PUBKEY);
      const accountInfo = await client.readAccountInfo(pubkeyBytes);
      if (accountInfo) {
        setIsProgramDeployed(true);
        setError(null);
      }
    } catch (error) {
      console.error('Error checking program:', error);
      setError('The Arch Graffiti program has not been deployed to the network yet. Please run `arch-cli deploy`.');
    }
  }, []);

  // Check if the wall account exists
  const checkAccountCreated = useCallback(async () => {
    try {
      const pubkeyBytes = PubkeyUtil.fromHex(WALL_ACCOUNT_PUBKEY);
      const accountInfo = await client.readAccountInfo(pubkeyBytes);
      if (accountInfo) {
        setIsAccountCreated(true);
        setError(null);
      }
    } catch (error) {
      console.error('Error checking account:', error);
      setIsAccountCreated(false);
      setError('The wall account has not been created yet. Please run the account creation command.');
    }
  }, []);

  // Fetch and parse wall messages
  const fetchWallData = useCallback(async () => {
    try {
        const userAccount = await client.readAccountInfo(accountPubkey);
        if (!userAccount) {
            setError('Account not found.');
            return;
        }
        const wallData = userAccount.data;
        
        console.debug(`Wall data: ${wallData}`);

        // If data is empty or invalid length, just set empty messages without error
        if (!wallData || wallData.length < 4) {
            setWallData([]);
            setError(null); // Clear any existing errors
            return;
        }
        
        // Deserialize the wall data using borsh
        // Read data directly from the buffer
        const messages = [];
        let offset = 0;

        // First 4 bytes are the array length
        const messageCount = new DataView(wallData.buffer).getUint32(offset, true);
        offset += 4;

        for (let i = 0; i < messageCount; i++) {
            // Read timestamp (8 bytes)
            const timestamp = new DataView(wallData.buffer).getBigInt64(offset, true);
            offset += 8;

            // Read name (16 bytes)
            const nameBytes = wallData.slice(offset, offset + 16);
            const name = new TextDecoder().decode(nameBytes.filter(x => x !== 0));
            offset += 16;

            // Read message (64 bytes)
            const messageBytes = wallData.slice(offset, offset + 64);
            const message = new TextDecoder().decode(messageBytes.filter(x => x !== 0));
            offset += 64;

            messages.push(new GraffitiMessage(
                Number(timestamp),
                name,
                message
            ));
        }

        messages.sort((a, b) => b.timestamp - a.timestamp);

        setWallData(messages);
    } catch (error) {
        console.error('Error fetching wall data:', error);
        setError(`Failed to fetch wall data: ${error instanceof Error ? error.message : String(error)}`);
    }
}, []);

  // Initialize component
  useEffect(() => {
    checkProgramDeployed();
    checkAccountCreated();
  }, [checkAccountCreated, checkProgramDeployed]);

  // Set up polling for wall data
  useEffect(() => {
    if (!isAccountCreated) return;

    fetchWallData();
    const interval = setInterval(fetchWallData, 5000);
    return () => clearInterval(interval);
  }, [isAccountCreated, fetchWallData]);

  // Message handlers
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    const bytes = new TextEncoder().encode(newName);

    if (bytes.length <= 16) {
      setName(newName);
      setIsFormValid(newName.trim() !== '' && message.trim() !== '');
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMessage = e.target.value;
    const bytes = new TextEncoder().encode(newMessage);

    if (bytes.length <= 64) {
      setMessage(newMessage);
      setIsFormValid(name.trim() !== '' && newMessage.trim() !== '');
    }
  };

  const handleAddToWall = async () => {
    if (!message.trim() || !name.trim() || !isAccountCreated || !wallet.isConnected) {
      setError("Name and message are required, account must be created, and wallet must be connected.");
      return;
    }

    try {
      const data = serializeGraffitiData(name, message);
    
      const instruction: Instruction = {
        program_id: PubkeyUtil.fromHex(PROGRAM_PUBKEY),
        accounts: [
          { 
            pubkey: PubkeyUtil.fromHex(wallet.publicKey!), 
            is_signer: true, 
            is_writable: false 
          },
          { 
            pubkey: accountPubkey, 
            is_signer: false, 
            is_writable: true 
          },
        ],
        data: new Uint8Array(data),
      };

      const messageObj : Message = {
        signers: [PubkeyUtil.fromHex(wallet.publicKey!)],
        instructions: [instruction],
      };

      console.log(`Pubkey: ${PubkeyUtil.fromHex(wallet.publicKey!)}`);
      const messageBytes = MessageUtil.serialize(messageObj);
      console.log(`Message hash: ${MessageUtil.hash(messageObj).toString()}`);
      const signature = await wallet.signMessage(Buffer.from(MessageUtil.hash(messageObj)).toString('hex'));
      console.log(`Signature: ${signature}`);

      // Take last 64 bytes of base64 decoded signature
      const signatureBytes = new Uint8Array(Buffer.from(signature, 'base64')).slice(2);
      console.log(`Signature bytes: ${signatureBytes}`);

      const result = await client.sendTransaction({
        version: 0,
        signatures: [signatureBytes],
        message: messageObj,
      });

      if (result) {
        await fetchWallData();
        setMessage('');
        setName('');
      }
    } catch (error) {
      console.error('Error adding to wall:', error);
      setError(`Failed to add to wall: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const serializeGraffitiData = (name: string, message: string): number[] => {
    // Create fixed-size arrays
    const nameArray = new Uint8Array(16).fill(0);
    const messageArray = new Uint8Array(64).fill(0);
    
    // Convert strings to bytes
    const nameBytes = new TextEncoder().encode(name);
    const messageBytes = new TextEncoder().encode(message);
    
    // Copy bytes into fixed-size arrays (will truncate if too long)
    nameArray.set(nameBytes.slice(0, 16));
    messageArray.set(messageBytes.slice(0, 64));
    
    // Create the params object matching the Rust struct
    const params = {
        name: Array.from(nameArray),
        message: Array.from(messageArray)
    };
    
    // Define the schema for borsh serialization
    const schema = {
        struct: {
            name: { array: { type: 'u8', len: 16 } },
            message: { array: { type: 'u8', len: 64 } }
        }
    };
    
    return Array.from(borsh.serialize(schema, params));
};

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isFormValid) {
        handleAddToWall();
      }
    }
  };


  return (
    <>
    <AnimatedBackground />
    <div className="min-h-screen relative">      
    
      <div className="bg-gradient-to-br from-arch-gray/90 to-gray-900/90 backdrop-blur-sm p-8 rounded-lg shadow-lg max-w-4xl mx-auto relative z-10">
        <h2 className="text-3xl font-bold mb-6 text-center text-arch-white">Graffiti Wall</h2>

        <div className="mb-4 p-4 bg-arch-black rounded-lg hidden">
        <h4 className="text-arch-orange font-bold mb-2">Debug Info:</h4>
        <div className="text-arch-white text-sm font-mono">
          <p>Wallet Connected: {String(wallet.isConnected)}</p>
          <p>Public Key: {wallet.publicKey || 'none'}</p>
          <p>Address: {wallet.address || 'none'}</p>
          {debugInfo.map((log, i) => (
            <p key={i} className="text-xs">{log}</p>
          ))}
        </div>

      </div>

      {!wallet.isConnected ? (
        <div className="space-y-4 mb-4">
          <div className="flex items-center justify-center space-x-4 bg-arch-black p-4 rounded-lg">
            <img src="/xverse.png" alt="Xverse Wallet" className="h-6" />
            <p className="text-arch-white text-sm">
              Compatible with Xverse Wallet in <span className="text-arch-orange font-semibold">Testnet mode</span>
            </p>
          </div>
          <button
            onClick={async () => {
              try {
                addDebugLog('Attempting wallet connection...');
                await wallet.connect();
                addDebugLog('Wallet connected successfully');
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                addDebugLog(`Connection error: ${errorMessage}`);
                setError(`Failed to connect: ${errorMessage}`);
              }
            }}
            className="w-full mb-4 bg-arch-orange text-arch-black font-bold py-2 px-4 rounded-lg hover:bg-arch-white transition duration-300"
          >
            Connect Wallet
          </button>
          {error && (
            <div className="mt-6 p-4 bg-red-500 text-white rounded-lg">
              <div className="flex items-center mb-2">
                <AlertCircle className="w-6 h-6 mr-2" />
                <p className="font-bold">Program Error</p>
              </div>
              <p>{error}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="mb-4 space-y-2">
          <button
            onClick={wallet.disconnect}
            className="w-full bg-gray-600 text-arch-white font-bold py-2 px-4 rounded-lg hover:bg-gray-700 transition duration-300"
          >
            Disconnect Wallet
          </button>
          <div className="bg-arch-black p-3 rounded-lg">
            <p className="text-arch-white text-sm">
              <span className="text-arch-orange font-semibold">Connected Address:</span>{' '}
              <span className="font-mono break-all">{wallet.address || wallet.publicKey}</span>
            </p>
          </div>
        </div>
      )}
      

      {!isAccountCreated ? (
        <div className="bg-arch-black p-6 rounded-lg">
          <h3 className="text-2xl font-bold mb-4 text-arch-white">Account Setup Required</h3>
          <p className="text-arch-white mb-4">To participate in the Graffiti Wall, please create an account using the Arch CLI:</p>
          <div className="relative mb-4">
            <pre className="bg-gray-800 p-4 rounded-lg text-arch-white overflow-x-auto">
              <code>
                arch-cli account create --name &lt;unique_name&gt; --program-id {PROGRAM_PUBKEY}
              </code>
            </pre>
            <button
              onClick={copyToClipboard}
              className="absolute top-2 right-2 p-2 bg-arch-orange text-arch-black rounded hover:bg-arch-white transition-colors duration-300"
              title="Copy to clipboard"
            >
              {copied ? <Check size={20} /> : <Copy size={20} />}
            </button>
          </div>
          <p className="text-arch-white mb-4">Run this command in your terminal to set up your account.</p>
          
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-8">
          <div className="flex-1">
            <div className="bg-arch-black p-6 rounded-lg">
              <h3 className="text-2xl font-bold mb-4 text-arch-white">Add to Wall</h3>
              <input
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder="Your Name (required, max 16 bytes)"
                className="w-full px-3 py-2 bg-arch-gray text-arch-white rounded-md focus:outline-none focus:ring-2 focus:ring-arch-orange mb-2"
                required
              />
              <textarea
                value={message}
                onChange={handleMessageChange}
                onKeyDown={handleKeyDown}
                placeholder="Your Message (required, max 64 bytes)"
                className="w-full px-3 py-2 bg-arch-gray text-arch-white rounded-md focus:outline-none focus:ring-2 focus:ring-arch-orange mb-2"
                required
              />
              <button 
                onClick={handleAddToWall}
                className={`w-full font-bold py-2 px-4 rounded-lg transition duration-300 ${
                  isFormValid 
                    ? 'bg-arch-orange text-arch-black hover:bg-arch-white hover:text-arch-orange' 
                    : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                }`}
                disabled={!isFormValid}
              >
                Add to the Wall
              </button>
            </div>
          </div>
          
          <div className="flex-1">
            <div className="bg-arch-black p-6 rounded-lg">
              <h3 className="text-2xl font-bold mb-4 text-arch-white">Wall Messages</h3>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {wallData.map((item, index) => (
                  <div key={index} className="bg-arch-gray p-3 rounded-lg">
                    <p className="font-bold text-arch-orange">{new Date(item.timestamp * 1000).toLocaleString()}</p>
                    <p className="text-arch-white"><span className="font-semibold">{item.name}:</span> {item.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 pt-4 border-t border-arch-gray">
        <div className="flex justify-center space-x-8 text-sm text-arch-white">
          <span className="flex items-center">
            © <a 
              href="https://www.arch.network/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-arch-orange transition duration-300 mx-1 font-bold"
            >
              Arch Network
            </a> 2024 | All rights reserved
          </span>
          <a 
            href="https://github.com/Arch-Network" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center hover:text-arch-orange transition duration-300"
          >
            <Github className="w-4 h-4 mr-2" />
            Developers
          </a>
        </div>
      </div>
    </div>
  </div>
  </>
  );
};

export default GraffitiWallComponent;