const { assert, expect } = require("chai");
const { network, deployments, ethers, getNamedAccounts } = require("hardhat");
const { developmentChains } = require("../../helper-hardhat-config");

!developmentChains.includes(network.name)
	? describe.skip
	: describe("NFT Marketplace Tests", function () {
			let nftMarketplace,
				nftMarketplaceContract,
				basicNft,
				basicNftContract,
				deployer,
				user;
			const PRICE = ethers.utils.parseEther("0.1");
			const TOKEN_ID = 0;
			beforeEach(async function () {
				// deployer = (await getNamedAccounts()).deployer;
				// user = (await getNamedAccounts()).user;
				const accounts = await ethers.getSigners();
				deployer = accounts[0];
				user = accounts[1];
				await deployments.fixture(["all"]);
				nftMarketplaceContract = await ethers.getContract("NftMarketplace");
				nftMarketplace = nftMarketplaceContract.connect(deployer);
				basicNftContract = await ethers.getContract("BasicNft");
				basicNft = basicNftContract.connect(deployer);
				await basicNft.mintNft();
				await basicNft.approve(nftMarketplaceContract.address, TOKEN_ID);
			});

			describe("listItem", function () {
				it("emits item listed", async function () {
					expect(
						await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
					).to.emit("ItemListed");
				});

				it("reverts if already listed", async function () {
					nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE);
					await expect(
						nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
					).to.be.revertedWith("NftMarketplace__AlreadyListed");
				});

				it("reverts if no owner", async function () {
					await expect(
						nftMarketplace.listItem(basicNft.address, TOKEN_ID, 0)
					).to.be.revertedWith("NftMarketplace__PriceMustBeAboveZero");
				});

				it("reverts if price is 0", async function () {
					await expect(
						nftMarketplace.listItem(basicNft.address, TOKEN_ID, 0)
					).to.be.revertedWith("NftMarketplace__PriceMustBeAboveZero");
				});

				it("reverts if not approved", async function () {
					await basicNft.approve(ethers.constants.AddressZero, TOKEN_ID);
					await expect(
						nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
					).to.be.revertedWith("NotApprovedForMarketplace");
				});

				it("gets the listing", async function () {
					await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE);
					const owner = await basicNft.ownerOf(TOKEN_ID);
					const listing = await nftMarketplace.getListing(
						basicNft.address,
						TOKEN_ID
					);
					assert.equal(listing.price.toString(), PRICE.toString());
					assert.equal(listing.seller, owner);
				});
			});

			describe("cancelListing", function () {
				it("reverts if is sender not the owner", async function () {
					await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE);
					const userConnectedNftMarketplace =
						nftMarketplaceContract.connect(user);
					await expect(
						userConnectedNftMarketplace.cancelListing(
							basicNft.address,
							TOKEN_ID
						)
					).to.be.revertedWith("NftMarketplace__NotOwner");
				});

				it("reverts if the item isnt listed", async function () {
					const error = `NftMarketplace__NotListed("${basicNft.address}", ${TOKEN_ID})`;
					await expect(
						nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
					).to.be.revertedWith(error);
				});

				it("emits item canceled and removes listing", async function () {
					await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE);
					expect(
						await nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
					).to.emit("ItemCanceled");
					const listing = await nftMarketplace.getListing(
						basicNft.address,
						TOKEN_ID
					);
					assert.equal(listing.price.toString(), "0");
					assert.equal(listing.seller, ethers.constants.AddressZero);
				});
			});

			describe("buyItem", function () {
				it("reverts if the item isnt listed", async function () {
					await expect(
						nftMarketplace.buyItem(basicNft.address, TOKEN_ID)
					).to.be.revertedWith("NftMarketplace__NotListed");
				});

				it("reverts if price not met", async function () {
					const LOWER_PRICE = ethers.utils.parseEther("0.01");
					await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE);
					const userConnectedNftMarketplace =
						nftMarketplaceContract.connect(user);
					await expect(
						userConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
							value: LOWER_PRICE,
						})
					).to.be.revertedWith("NftMarketplace__PriceNotMet");
				});

				it("transfers the nft to the buyer and updates internal proceeds record", async function () {
					await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE);
					nftMarketplace = nftMarketplaceContract.connect(user);
					expect(
						await nftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
							value: PRICE,
						})
					).to.emit("ItemBought");
					const newOwner = await basicNft.ownerOf(TOKEN_ID);
					const deployerProceeds = await nftMarketplace.getProceeds(
						deployer.address
					);
					assert(newOwner.toString() == user.address);
					assert(deployerProceeds.toString() == PRICE.toString());
				});
			});

			describe("updateListing", function () {
				it("reverts if the item isnt listed", async function () {
					await expect(
						nftMarketplace.updateListing(basicNft.address, TOKEN_ID, PRICE)
					).to.be.revertedWith("NftMarketplace__NotListed");
				});

				it("reverts if is sender not the owner", async function () {
					await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE);
					const userConnectedNftMarketplace =
						nftMarketplaceContract.connect(user);
					await expect(
						userConnectedNftMarketplace.updateListing(
							basicNft.address,
							TOKEN_ID,
							PRICE
						)
					).to.be.revertedWith("NftMarketplace__NotOwner");
				});

				it("reverts if the new price is 0", async function () {
					await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE);
					const NEW_PRICE = ethers.utils.parseEther("0");
					await expect(
						nftMarketplace.updateListing(basicNft.address, TOKEN_ID, NEW_PRICE)
					).to.be.revertedWith("NftMarketplace__PriceMustBeAboveZero");
				});

				it("updates listing price", async function () {
					await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE);
					const NEW_PRICE = ethers.utils.parseEther("0.2");
					expect(
						await nftMarketplace.updateListing(
							basicNft.address,
							TOKEN_ID,
							NEW_PRICE
						)
					).to.emit("ItemListed");
					const listing = await nftMarketplace.getListing(
						basicNft.address,
						TOKEN_ID
					);
					assert.equal(listing.price.toString(), NEW_PRICE.toString());
				});
			});

			describe("withdrawProceeds", function () {
				it("reverts if no proceeds", async function () {
					await expect(nftMarketplace.withdrawProceeds()).to.be.revertedWith(
						"NftMarketplace_NoProceeds"
					);
				});
				it("withdraws proceeds", async function () {
					await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE);
					const userConnectedNftMarketplace =
						nftMarketplaceContract.connect(user);
					await userConnectedNftMarketplace.buyItem(
						basicNft.address,
						TOKEN_ID,
						{
							value: PRICE,
						}
					);
					nftMarketplace = nftMarketplaceContract.connect(deployer);

					const deployerProceedsBefore = await nftMarketplace.getProceeds(
						deployer.address
					);
					const deployerBalanceBefore = await deployer.getBalance();
					const txResponse = await nftMarketplace.withdrawProceeds();
					const transactionReceipt = await txResponse.wait(1);
					const { gasUsed, effectiveGasPrice } = transactionReceipt;
					const gasCost = gasUsed.mul(effectiveGasPrice);
					const deployerBalanceAfter = await deployer.getBalance();

					assert(
						deployerBalanceAfter.add(gasCost).toString() ==
							deployerProceedsBefore.add(deployerBalanceBefore).toString()
					);
				});
			});
	  });
