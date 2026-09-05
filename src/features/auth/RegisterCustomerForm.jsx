import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { errorMessage } from "../../lib/api";
import { Button, Field, Input } from "../../components/ui";

// The customer's own way in, separate from the staff access request beside it.
// Registering creates the company record as well as the login, so a company
// that has never dealt with us can arrive and ask for a price.
export function RegisterCustomerForm({ mode, onDone }) {
  const { registerCustomer } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState("");

  const { register, handleSubmit, formState } = useForm({
    defaultValues: { companyName: "", name: "", email: "", password: "", phone: "", city: "" },
  });

  async function onSubmit(values) {
    setFormError("");
    try {
      await registerCustomer({ ...values, mode });
      navigate("/portal", { replace: true });
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field
        label="Company name"
        htmlFor="companyName"
        tooltip="Creates the customer record quotations will be raised against."
        error={formState.errors.companyName?.message}
      >
        <Input
          id="companyName"
          type="text"
          autoComplete="organization"
          hasError={Boolean(formState.errors.companyName)}
          {...register("companyName", {
            required: "Enter your company name",
            minLength: { value: 2, message: "Company name is too short" },
          })}
        />
      </Field>

      <Field
        label="Your name"
        htmlFor="portal-name"
        tooltip="The person who will sign in to the customer portal."
        error={formState.errors.name?.message}
      >
        <Input
          id="portal-name"
          type="text"
          autoComplete="name"
          hasError={Boolean(formState.errors.name)}
          {...register("name", {
            required: "Enter your name",
            minLength: { value: 2, message: "Name is too short" },
          })}
        />
      </Field>

      <Field
        label="Work email"
        htmlFor="portal-email"
        tooltip="Portal login and the address quotations are sent to."
        error={formState.errors.email?.message}
      >
        <Input
          id="portal-email"
          type="email"
          autoComplete="username"
          hasError={Boolean(formState.errors.email)}
          {...register("email", { required: "Enter your email address" })}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="portal-password"
        tooltip="At least 8 characters. Signs this buyer into the portal immediately."
        error={formState.errors.password?.message}
      >
        <Input
          id="portal-password"
          type="password"
          autoComplete="new-password"
          hasError={Boolean(formState.errors.password)}
          {...register("password", {
            required: "Choose a password",
            minLength: { value: 8, message: "Password must be at least 8 characters" },
          })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" htmlFor="portal-phone" hint="Optional" tooltip="Stored on the company record. Not required to register.">
          <Input id="portal-phone" type="tel" autoComplete="tel" {...register("phone")} />
        </Field>

        <Field label="City" htmlFor="portal-city" hint="Optional" tooltip="Helps the rep plan fulfilment when a quotation is raised.">
          <Input
            id="portal-city"
            type="text"
            autoComplete="address-level2"
            {...register("city")}
          />
        </Field>
      </div>

      {formError && (
        <p className="rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-sm text-state-bad">
          {formError}
        </p>
      )}

      <Button type="submit" className="w-full" isLoading={formState.isSubmitting}>
        Create account
      </Button>

      <Button variant="ghost" className="w-full" onClick={onDone}>
        Back to sign in
      </Button>
    </form>
  );
}
