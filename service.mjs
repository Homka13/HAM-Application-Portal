// @ts-check
import node from "@prisma/composer/node";
import { compute } from "@prisma/composer-prisma-cloud";
import { postgres, dataContract } from "@prisma/composer-prisma-cloud/orm";
import hamApplicationPortalContractJson from "./src/prisma/contract.json" with { type: "json" };

export default compute({
  name: "ham-application-portal",
  deps: { db: postgres(dataContract(hamApplicationPortalContractJson)) },
  build: node({ module: import.meta.url, dir: "dist", entry: "index.js" }),
});
