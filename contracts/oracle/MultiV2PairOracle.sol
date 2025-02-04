pragma solidity =0.6.6;
pragma experimental ABIEncoderV2;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";

import "../libraries/UniswapV2OracleLibrary.sol";
import "../libraries/UniswapV2Library.sol";
import "hardhat/console.sol";

contract MultiV2PairOracle {
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

    constructor(address _factory) public {
        require(_factory != address(0), "invalid address");
        factory = _factory;
    }

    function allPairsLength() external view returns (uint) {
        return allPairs.length;
    }

    function addPair(address tokenA, address tokenB) public {
        address _pair = UniswapV2Library.pairFor(factory, tokenA, tokenB);
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

            console.log("timeElapsed=%d, PERIOD=%d", timeElapsed, PERIOD);
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
            console.log("updated pair: ", pairOracle.pair);
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
            address _pair = UniswapV2Library.pairFor(
                factory,
                tokenPath[i],
                tokenPath[i + 1]
            );
            PairOracle storage pairOracle = getOracle[_pair];
            require(pairOracle.pair != address(0), "pair does not exist");
            amountOut = _consult(_pair, tokenPath[i], _amountIn);
            console.log(
                "pair:%s, _amountIn=%d, amountOut=d",
                _pair,
                _amountIn,
                amountOut
            );
            _amountIn = amountOut;
        }
    }
}
