pragma solidity =0.6.6;
pragma experimental ABIEncoderV2;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";

import "../libraries/UniswapV2OracleLibrary.sol";
import "../libraries/UniswapV2Library.sol";

import "./Context.sol";
import "./Ownable.sol";

// import "hardhat/console.sol";

contract MultiV2PairOracle is Context, Ownable {
    using FixedPoint for *;

    uint public constant PERIOD = 24 hours;

    address immutable factory;

    // fixed window oracle that recomputes the average price for the entire period once every period
    // note that the price average is only guaranteed to be over at least 1 period, but may be over a longer period
    struct PairOracle {
        address pair;
        address token0;
        address token1;
        uint price0CumulativeLast;
        uint price1CumulativeLast;
        uint32 blockTimestampLast;
        FixedPoint.uq112x112 price0Average;
        FixedPoint.uq112x112 price1Average;
    }

    mapping(address => PairOracle) public getOracle;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairAdded(
        address indexed token0,
        address indexed token1,
        address pair,
        uint
    );

    event PairRemoved(
        address indexed token0,
        address indexed token1,
        address pair
    );

    event Updated(
        address indexed pair,
        uint price0Cumulative,
        uint price1Cumulative,
        uint price0Average,
        uint price1Average,
        uint32 blockTimestamp
    );

    constructor(address _factory) public Ownable(msg.sender) {
        require(_factory != address(0), "invalid address");
        factory = _factory;
    }

    function allPairsLength() external view returns (uint) {
        return allPairs.length;
    }

    function addPair(address tokenA, address tokenB) public onlyOwner {
        address _pair = IUniswapV2Factory(factory).getPair(tokenA, tokenB);
        PairOracle storage pairOracle = getOracle[_pair];
        require(pairOracle.pair == address(0), "pair exist");

        uint112 reserve0;
        uint112 reserve1;
        uint32 _blockTimestampLast;
        (reserve0, reserve1, _blockTimestampLast) = IUniswapV2Pair(_pair)
            .getReserves();
        require(reserve0 != 0 && reserve1 != 0, "NO_RESERVES"); // ensure that there's liquidity in the pair
        pairOracle.pair = _pair;
        pairOracle.token0 = IUniswapV2Pair(_pair).token0();
        pairOracle.token1 = IUniswapV2Pair(_pair).token1();
        pairOracle.price0CumulativeLast = IUniswapV2Pair(_pair)
            .price0CumulativeLast(); // fetch the current accumulated price value (1 / 0)
        pairOracle.price1CumulativeLast = IUniswapV2Pair(_pair)
            .price1CumulativeLast(); // fetch the current accumulated price value (0 / 1)
        pairOracle.blockTimestampLast = _blockTimestampLast;

        getPair[tokenA][tokenB] = _pair;
        getPair[tokenB][tokenA] = _pair; // populate mapping in the reverse direction
        allPairs.push(_pair);

        emit PairAdded(
            pairOracle.token0,
            pairOracle.token1,
            _pair,
            allPairs.length
        );
    }

    function removePair(address tokenA, address tokenB) public onlyOwner {
        address _pair = IUniswapV2Factory(factory).getPair(tokenA, tokenB);
        PairOracle storage pairOracle = getOracle[_pair];
        require(pairOracle.pair != address(0), "pair does not exist");

        emit PairRemoved(pairOracle.token0, pairOracle.token1, _pair);

        pairOracle.pair = address(0);
        pairOracle.token0 = address(0);
        pairOracle.token1 = address(0);
        pairOracle.price0CumulativeLast = 0;
        pairOracle.price1CumulativeLast = 0;
        pairOracle.blockTimestampLast = 0;

        getPair[tokenA][tokenB] = address(0);
        getPair[tokenB][tokenA] = address(0);
    }

    function update() external {
        uint pairsLen = allPairs.length;
        for (uint256 i = 0; i < pairsLen; i++) {
            address _pair = allPairs[i];
            PairOracle storage pairOracle = getOracle[_pair];
            if (pairOracle.pair == address(0)) {
                continue;
            }
            (
                uint price0Cumulative,
                uint price1Cumulative,
                uint32 blockTimestamp
            ) = UniswapV2OracleLibrary.currentCumulativePrices(pairOracle.pair);
            uint32 timeElapsed = blockTimestamp - pairOracle.blockTimestampLast; // overflow is desired

            // console.log("timeElapsed=%d, PERIOD=%d", timeElapsed, PERIOD);
            // ensure that at least one full period has passed since the last update
            if (timeElapsed < PERIOD) {
                continue;
            }

            // overflow is desired, casting never truncates
            // cumulative price is in (uq112x112 price * seconds) units so we simply wrap it after division by time elapsed
            pairOracle.price0Average = FixedPoint.uq112x112(
                uint224(
                    (price0Cumulative - pairOracle.price0CumulativeLast) /
                        timeElapsed
                )
            );
            pairOracle.price1Average = FixedPoint.uq112x112(
                uint224(
                    (price1Cumulative - pairOracle.price1CumulativeLast) /
                        timeElapsed
                )
            );

            pairOracle.price0CumulativeLast = price0Cumulative;
            pairOracle.price1CumulativeLast = price1Cumulative;
            pairOracle.blockTimestampLast = blockTimestamp;
            // console.log("updated pair: ", pairOracle.pair);
            emit Updated(
                _pair,
                price0Cumulative,
                price1Cumulative,
                pairOracle.price0Average.mul(1).decode144(),
                pairOracle.price1Average.mul(1).decode144(),
                blockTimestamp
            );
        }
    }

    // // note this will always return 0 before update has been called successfully for the first time.
    function _consult(
        address pair,
        address token,
        uint amountIn
    ) internal view returns (uint amountOut) {
        PairOracle storage pairOracle = getOracle[pair];
        if (pairOracle.pair == address(0)) {
            return 0;
        }

        if (token == pairOracle.token0) {
            amountOut = pairOracle.price0Average.mul(amountIn).decode144();
        } else {
            require(token == pairOracle.token1, "INVALID_TOKEN");
            amountOut = pairOracle.price1Average.mul(amountIn).decode144();
        }
    }

    // // note this will always return 0 before update has been called successfully for the first time.
    function consult(
        address[] calldata tokenPath,
        uint amountIn
    ) external view returns (uint amountOut) {
        uint tokenPathLen = tokenPath.length;
        require(tokenPathLen > 1, "INVALID_PATH_LEN");

        uint _amountIn = amountIn;
        for (uint i = 0; i < tokenPathLen - 1; i++) {
            address _pair = IUniswapV2Factory(factory).getPair(
                tokenPath[i],
                tokenPath[i + 1]
            );
            PairOracle storage pairOracle = getOracle[_pair];
            require(pairOracle.pair != address(0), "pair does not exist");
            amountOut = _consult(_pair, tokenPath[i], _amountIn);
            // console.log(
            //     "pair:%s, _amountIn=%d, amountOut=d",
            //     _pair,
            //     _amountIn,
            //     amountOut
            // );
            _amountIn = amountOut;
        }
    }
}
