import { db } from "./db";
import { toPaisa, uid } from "./money";
import { hashPassword } from "./auth";
import type { Customer, Product, ProductFamily, FamilyPricing, BusinessSettings, User } from "./types";

const FAMILIES: { name: string; drum: number; gallon: number; quartar: number; codes: string[] }[] = [
  { name: "Aqua Matt", drum: 21500, gallon: 5700, quartar: 1500, codes: Array.from({ length: 54 }, (_, i) => String(401 + i)) },
  { name: "Super Emulsion", drum: 18000, gallon: 4800, quartar: 1300, codes: ["101","102","103","104","105"] },
  { name: "Super Enamel", drum: 22000, gallon: 6000, quartar: 1600, codes: ["201","202","203"] },
  { name: "Classic Emulsion", drum: 15000, gallon: 4000, quartar: 1100, codes: ["301","302"] },
  { name: "Weather Grip", drum: 19500, gallon: 5200, quartar: 1400, codes: ["501","502","503"] },
  { name: "Awami Emulsion", drum: 12000, gallon: 3200, quartar: 900, codes: ["601","602"] },
  { name: "Budget Distemper", drum: 8000, gallon: 2200, quartar: 600, codes: ["701"] },
  { name: "Eco Star Emulsion", drum: 16000, gallon: 4200, quartar: 1150, codes: ["801","802"] },
];

export async function seedIfEmpty() {
  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    const settings: BusinessSettings = {
      id: "main", name: "M.A PAINT HOUSE", address: "Main Bazaar, Khuzdar, Balochistan",
      phone: "+92 300 1234567", whatsapp: "+92 300 1234567", currency: "Rs",
      invoicePrefix: "INV", invoiceCounter: 1000, defaultDiscount: 0,
      footer: "Thank you for your business. M.A Paint House.",
      paymentMethods: ["Cash", "Bank transfer", "JazzCash", "EasyPaisa", "Cheque", "Other"],
      taxEnabled: false, taxRate: 0,
    };
    await db.settings.put(settings);
  }

  const existingBashir = await db.customers.get("cust-bashir-kalat");
  if (!existingBashir) {
    const bashir: Customer = { id: "cust-bashir-kalat", name: "Bashir Kalat", phone: "+92 300 1111111", whatsapp: "+92 300 1111111", address: "Kalat", city: "Kalat", openingBalance: toPaisa(201920), discount: 26, notes: "Existing customer", createdAt: new Date().toISOString(), active: true };
    await db.customers.put(bashir);
    await db.ledger.put({ id: "ledger-open-bashir", customerId: bashir.id, date: new Date().toISOString().slice(0, 10), type: "opening", reference: "OPEN", description: "Opening balance", debit: bashir.openingBalance, credit: 0, balance: bashir.openingBalance, createdAt: new Date().toISOString() });
  }

  const famCount = await db.families.count();
  if (famCount === 0) {
    for (const f of FAMILIES) {
      const fid = `fam-${f.name.replace(/\s+/g, "-").toLowerCase()}`;
      await db.families.put({ id: fid, name: f.name, description: "", status: "active", createdAt: new Date().toISOString() });
      await db.pricing.put({ familyId: fid, drumPrice: toPaisa(f.drum), gallonPrice: toPaisa(f.gallon), quartarPrice: toPaisa(f.quartar), updatedAt: new Date().toISOString() });
      for (const code of f.codes) {
        for (const size of ["Drum", "Gallon", "Quartar"] as const) {
          const price = size === "Drum" ? f.drum : size === "Gallon" ? f.gallon : f.quartar;
          await db.products.put({ id: `prod-${fid}-${code}-${size}`, name: `${f.name} ${code}`, colourCode: code, familyId: fid, size, price: toPaisa(price), override: false, code: `${f.name.slice(0,3).toUpperCase()}-${code}`, category: f.name, brand: f.name, description: "", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }
      }
    }
    // accessories
    const accId = "fam-brush-sandpaper";
    await db.families.put({ id: accId, name: "Brush & Sandpaper", description: "Accessories", status: "active", createdAt: new Date().toISOString() });
    await db.pricing.put({ familyId: accId, drumPrice: 0, gallonPrice: 0, quartarPrice: 0, updatedAt: new Date().toISOString() });
    await db.products.put({ id: "prod-brush-1", name: "Paint Brush 4 inch", colourCode: "", familyId: accId, size: "Other", price: toPaisa(350), override: true, code: "BR-01", category: "Accessories", brand: "", description: "", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
}