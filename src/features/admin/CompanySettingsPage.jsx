import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Trash2, Upload } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import {
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Spinner,
  Textarea,
  useToast,
} from "../../components/ui";
import { api, errorMessage } from "../../lib/api";

const BLANK = {
  companyName: "",
  companyAddress: "",
  companyGstin: "",
  companyPhone: "",
  companyEmail: "",
  companyWebsite: "",
  documentFooter: "",
};

export function CompanySettingsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileInput = useRef(null);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState("");

  const company = useQuery({
    queryKey: ["company"],
    queryFn: async () => (await api.get("/company")).data.company,
  });

  useEffect(() => {
    if (!company.data) return;
    setForm({
      companyName: company.data.companyName || "",
      companyAddress: company.data.companyAddress || "",
      companyGstin: company.data.companyGstin || "",
      companyPhone: company.data.companyPhone || "",
      companyEmail: company.data.companyEmail || "",
      companyWebsite: company.data.companyWebsite || "",
      documentFooter: company.data.documentFooter || "",
    });
  }, [company.data]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const save = useMutation({
    mutationFn: () => api.patch("/company", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company"] });
      toast("Company details saved — they appear on every document from now on");
      setError("");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const uploadLogo = useMutation({
    mutationFn: (file) => {
      const body = new FormData();
      body.append("logo", file);
      return api.post("/company/logo", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company"] });
      toast("Logo updated");
      setError("");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  const removeLogo = useMutation({
    mutationFn: () => api.delete("/company/logo"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company"] });
      toast("Logo removed");
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  if (company.isLoading) return <Spinner label="Loading company details" />;
  if (company.isError) {
    return <ErrorState message={errorMessage(company.error)} onRetry={company.refetch} />;
  }

  const logoPath = company.data.logoPath;

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Company details"
        subtitle="What a customer sees on the portal and on every quotation and invoice."
        actions={
          <Button
            icon={Save}
            isLoading={save.isPending}
            disabled={!form.companyName.trim()}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Identity"
            subtitle="Printed in the header of every document."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Company name" htmlFor="company-name">
                <Input
                  id="company-name"
                  value={form.companyName}
                  onChange={(event) => set("companyName", event.target.value)}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Address" htmlFor="company-address">
                <Textarea
                  id="company-address"
                  rows={2}
                  value={form.companyAddress}
                  onChange={(event) => set("companyAddress", event.target.value)}
                  placeholder="401 Iscon Centre, S G Highway, Ahmedabad 380015"
                />
              </Field>
            </div>

            <Field label="GSTIN" htmlFor="company-gstin">
              <Input
                id="company-gstin"
                value={form.companyGstin}
                onChange={(event) => set("companyGstin", event.target.value)}
                placeholder="24AABCU9603R1ZM"
              />
            </Field>

            <Field label="Phone" htmlFor="company-phone">
              <Input
                id="company-phone"
                value={form.companyPhone}
                onChange={(event) => set("companyPhone", event.target.value)}
              />
            </Field>

            <Field label="Email" htmlFor="company-email">
              <Input
                id="company-email"
                type="email"
                value={form.companyEmail}
                onChange={(event) => set("companyEmail", event.target.value)}
              />
            </Field>

            <Field label="Website" htmlFor="company-website">
              <Input
                id="company-website"
                value={form.companyWebsite}
                onChange={(event) => set("companyWebsite", event.target.value)}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field
                label="Document footer"
                htmlFor="company-footer"
                hint="Terms or bank details, along the bottom of every page."
              >
                <Textarea
                  id="company-footer"
                  rows={2}
                  value={form.documentFooter}
                  onChange={(event) => set("documentFooter", event.target.value)}
                  placeholder="Payment within 30 days. Goods remain our property until paid for in full."
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Logo" subtitle="Header and watermark on every PDF." />

          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-sand-300 bg-sand-50 p-4">
            {logoPath ? (
              <img src={logoPath} alt="Company logo" className="max-h-24 max-w-full object-contain" />
            ) : (
              <p className="text-center text-sm text-sand-600">
                No logo yet. Documents fall back to the company name.
              </p>
            )}
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadLogo.mutate(file);
              // Cleared so choosing the same file twice still fires a change.
              event.target.value = "";
            }}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={Upload}
              isLoading={uploadLogo.isPending}
              onClick={() => fileInput.current?.click()}
            >
              {logoPath ? "Replace" : "Upload"}
            </Button>

            {logoPath && (
              <Button
                variant="danger"
                icon={Trash2}
                isLoading={removeLogo.isPending}
                onClick={() => removeLogo.mutate()}
              >
                Remove
              </Button>
            )}
          </div>

          <p className="mt-3 text-sm text-sand-600">PNG, JPG or WebP, up to 2 MB.</p>
        </Card>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-base text-state-bad">
          {error}
        </p>
      )}
    </div>
  );
}
