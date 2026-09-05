// The company's own details, as the printed documents need them.

export async function companySettings(db) {
  const settings = await db.settings.findUnique({ where: { id: 1 } });

  return {
    company: {
      companyName: settings.companyName,
      companyAddress: settings.companyAddress,
      companyGstin: settings.companyGstin,
      companyPhone: settings.companyPhone,
      companyEmail: settings.companyEmail,
      companyWebsite: settings.companyWebsite,
      documentFooter: settings.documentFooter,
      logoPath: settings.logoPath,
    },
    currency: settings.currency,
  };
}
