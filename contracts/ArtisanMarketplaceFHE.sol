// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ArtisanMarketplaceFHE is SepoliaConfig {
    struct EncryptedPreference {
        uint256 id;
        euint32 encryptedStyle; // Encrypted user style preference
        euint32 encryptedRegion; // Encrypted region selection
        uint256 timestamp;
    }

    struct DecryptedPreference {
        string style;
        string region;
        bool isRevealed;
    }

    struct EncryptedRecommendation {
        uint256 prefId;
        euint32 encryptedArtisanId;
        euint32 encryptedProductId;
        uint256 timestamp;
    }

    struct DecryptedRecommendation {
        uint256 artisanId;
        uint256 productId;
        bool isRevealed;
    }

    uint256 public preferenceCount;
    uint256 public recommendationCount;

    mapping(uint256 => EncryptedPreference) public encryptedPreferences;
    mapping(uint256 => DecryptedPreference) public decryptedPreferences;

    mapping(uint256 => EncryptedRecommendation) public encryptedRecommendations;
    mapping(uint256 => DecryptedRecommendation) public decryptedRecommendations;

    mapping(uint256 => uint256) private requestToId;

    event PreferenceSubmitted(uint256 indexed id, uint256 timestamp);
    event RecommendationGenerated(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event PreferenceDecrypted(uint256 indexed id);
    event RecommendationDecrypted(uint256 indexed id);

    modifier onlyUser(uint256 prefId) {
        _;
    }

    function submitEncryptedPreference(
        euint32 encryptedStyle,
        euint32 encryptedRegion
    ) public {
        preferenceCount += 1;
        uint256 newId = preferenceCount;

        encryptedPreferences[newId] = EncryptedPreference({
            id: newId,
            encryptedStyle: encryptedStyle,
            encryptedRegion: encryptedRegion,
            timestamp: block.timestamp
        });

        decryptedPreferences[newId] = DecryptedPreference({
            style: "",
            region: "",
            isRevealed: false
        });

        emit PreferenceSubmitted(newId, block.timestamp);
    }

    function generateEncryptedRecommendation(
        uint256 prefId,
        euint32 encryptedArtisanId,
        euint32 encryptedProductId
    ) public {
        recommendationCount += 1;
        uint256 newId = recommendationCount;

        encryptedRecommendations[newId] = EncryptedRecommendation({
            prefId: prefId,
            encryptedArtisanId: encryptedArtisanId,
            encryptedProductId: encryptedProductId,
            timestamp: block.timestamp
        });

        decryptedRecommendations[newId] = DecryptedRecommendation({
            artisanId: 0,
            productId: 0,
            isRevealed: false
        });

        emit RecommendationGenerated(newId, block.timestamp);
    }

    function requestPreferenceDecryption(uint256 prefId) public onlyUser(prefId) {
        EncryptedPreference storage pref = encryptedPreferences[prefId];
        require(!decryptedPreferences[prefId].isRevealed, "Already decrypted");

        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(pref.encryptedStyle);
        ciphertexts[1] = FHE.toBytes32(pref.encryptedRegion);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptPreference.selector);
        requestToId[reqId] = prefId;

        emit DecryptionRequested(prefId);
    }

    function decryptPreference(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        uint256 prefId = requestToId[requestId];
        require(prefId != 0, "Invalid request");

        EncryptedPreference storage ePref = encryptedPreferences[prefId];
        DecryptedPreference storage dPref = decryptedPreferences[prefId];
        require(!dPref.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));

        dPref.style = results[0];
        dPref.region = results[1];
        dPref.isRevealed = true;

        emit PreferenceDecrypted(prefId);
    }

    function requestRecommendationDecryption(uint256 recId) public {
        EncryptedRecommendation storage rec = encryptedRecommendations[recId];
        require(!decryptedRecommendations[recId].isRevealed, "Already decrypted");

        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(rec.encryptedArtisanId);
        ciphertexts[1] = FHE.toBytes32(rec.encryptedProductId);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptRecommendation.selector);
        requestToId[reqId] = recId;

        emit DecryptionRequested(recId);
    }

    function decryptRecommendation(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        uint256 recId = requestToId[requestId];
        require(recId != 0, "Invalid request");

        EncryptedRecommendation storage eRec = encryptedRecommendations[recId];
        DecryptedRecommendation storage dRec = decryptedRecommendations[recId];
        require(!dRec.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint256[] memory results = abi.decode(cleartexts, (uint256[]));
        dRec.artisanId = results[0];
        dRec.productId = results[1];
        dRec.isRevealed = true;

        emit RecommendationDecrypted(recId);
    }

    function getDecryptedPreference(uint256 prefId) public view returns (string memory style, string memory region, bool isRevealed) {
        DecryptedPreference storage dPref = decryptedPreferences[prefId];
        return (dPref.style, dPref.region, dPref.isRevealed);
    }

    function getDecryptedRecommendation(uint256 recId) public view returns (uint256 artisanId, uint256 productId, bool isRevealed) {
        DecryptedRecommendation storage dRec = decryptedRecommendations[recId];
        return (dRec.artisanId, dRec.productId, dRec.isRevealed);
    }
}