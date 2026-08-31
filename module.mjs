// @ts-check
import { module } from "@prisma/composer";
import { postgres, dataContract } from "@prisma/composer-prisma-cloud/orm";
import hamApplicationPortalContractJson from "./src/prisma/contract.json" with { type: "json" };
import hamApplicationPortalService from "./service.mjs";

export default module("ham-application-portal", ({ provision }) => {
  const database = provision(postgres({ name: "database", contract: dataContract(hamApplicationPortalContractJson), config: "./prisma.config.ts" }));
  provision(hamApplicationPortalService, { id: "hamapplicationportal", deps: { db: database } });
});
