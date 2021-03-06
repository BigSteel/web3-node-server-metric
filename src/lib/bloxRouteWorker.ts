import WebSocket from 'ws';
import { gererateReportFs } from "./utils";
import { subProcessMessage } from './workerMessageUtils';
// import account_json from './config/account.json';


// const factory_address = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';

// const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
// const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
// const USDT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
// const CONTRACT_WETH_USDT = '0x0d4a11d5EEaaC28EC3F61d100daF4d40471f1852';

// const ws_profossional_url = 'wss://api.blxrbdn.com/ws';


export function blox_router_worker(provider: string, reportDirPath: string, providerName: string, startTime: string, filterMinGasPrice: string, filterPrecent: number) {

    const { logs_ws, pending_ws } = gererateReportFs(reportDirPath, providerName, startTime);

    const ws = new WebSocket(provider, {
        headers: { "Authorization": 'YjJjZGNmMGMtZTJiMS00YzBmLWE4M2YtMDM1NDIyNTFlNTBmOmQ2ZWNlZGNiNGYzN2FmYTkyNTQyN2JmNjcyNjNhY2M1' },
        rejectUnauthorized: false,
        checkServerIdentity: () => true
    });

    process.title = providerName;

    let fixMinPrice = parseInt(filterMinGasPrice) * filterPrecent - 0;

    subProcessMessage((msg) => {
        console.log(providerName, 'recieve ipc msg', msg)
        fixMinPrice = parseInt(msg.value) * filterPrecent - 0;
    })

    // const filterGasOps = 'gas_price > ' + fixMinPrice

    ws.on('open', function open() {
        console.log('open')
        // 不支持 pending 的filter 只有 go gateway 支持
        // const pending_sub = `{"jsonrpc": "2.0", "id": 1, "method": "subscribe", "params": ["pendingTxs", {"filters":"${filterGasOps}", "include": ["tx_hash"]}]}`;
        // const pending_sub = `{"jsonrpc": "2.0", "id": 1, "method": "subscribe", "params": ["pendingTxs", {"include": ["tx_hash","tx_contents"]}]}`;
        const pending_sub = `{"jsonrpc": "2.0", "id": 1, "method": "subscribe", "params": ["pendingTxs", {"include": ["tx_hash","tx_contents.gas_price","tx_contents.max_priority_fee_per_gas", "tx_contents.max_fee_per_gas"]}]}`;
        console.log(pending_sub);
        ws.send(pending_sub);
        ws.send(`{"jsonrpc": "2.0", "id": 2, "method": "subscribe", "params": ["newBlocks", {"include": ["header","hash"]}]}`);
    });

    const subscribeMap = {
        'pendingTxs': '',
        'newBlocks': ''
    }

    let evetReturn = (data: any) => {
        if (!data.id) return;
        console.log(data);
        if (data.id == 1) {
            subscribeMap.pendingTxs = data.result;
        }

        if (data.id == 2) {
            subscribeMap.newBlocks = data.result;
            handler = receiveData
        }

    }

    const isgateway = providerName === 'bloxRouter-gateway'

    let pendingData = ''
    let pendingDataCount = 0;

    let receiveData = (msg: any) => {
        if (msg.params.subscription === subscribeMap.pendingTxs) {
            // if (!msg.params.result.txContents.gasPrice) return;
            // console.log(msg.params.result);
            const gasPrice = (parseInt(msg.params.result.txContents.gasPrice) - 0);
            const gasMxPrice = (parseInt(msg.params.result.txContents.maxFeePerGas) - 0);
            // const gasPrioMxP = (parseInt(msg.params.result.txContents.maxPriorityFeePerGas) - 0);

            // isgateway ? console.log('bloxrouter-gateway p', msg.params.result.txHash, gasPrice, gasMxPrice, fixMinPrice) : ''
            if ((gasPrice && gasPrice <= fixMinPrice) || gasMxPrice <= fixMinPrice) return;
            pendingDataCount++;
            pendingData += Date.now() + ',' + msg.params.result.txHash + "\n"
            // pending_ws.write(Date.now() + ',' + tx + "\n")
            if (pendingDataCount >= 50) {
                pending_ws.write(pendingData, () => { })
                pendingDataCount = 0;
                pendingData = '';
            }
        } else {
            console.log(providerName, 'new block', Date.now())
            const content = Date.now() + ',' + (msg.params.result.header.number - 0) + ',' + msg.params.result.hash + "\n";
            logs_ws.write(content);
        }
    }

    let handler = evetReturn

    ws.on('message', (data: any) => {
        handler(JSON.parse(data));
    });

    ws.on('error', (err) => {
        console.log(err);
    })



    process.on('beforeExit', () => {
        if (pendingDataCount > 0) {
            pending_ws.write(pendingData)
            pendingDataCount = 0;
            pendingData = '';
            pending_ws.close()
        }
    })

    process.on('uncaughtException', (e) => {
        console.log('uncaughtException', e)
    })

    process.on('unhandledRejection', (e) => {
        console.log('unhandledRejection', e)
    })

}