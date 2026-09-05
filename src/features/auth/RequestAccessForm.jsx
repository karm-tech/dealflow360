import { useState } from "react";
import { useForm } from "react-hook-form";
import { CheckCircle2 } from "lucide-react";
import { useAuth } from "../../app/AuthProvider";
import { errorMessage } from "../../lib/api";
import { Button, Field, Input, Select } from "../../components/ui";
import { ROLE_LABELS, ROLES } from "../../lib/constants";

// Roles someone may ask for. What they actually get is decided by the admin who
// approves them — this field is a note to that admin, nothing more.
const REQUESTABLE_ROLES = [ROLES.SALES_REP, ROLES.SALES_MANAGER, ROLES.FINANCE, ROLES.ADMIN];

// Internal staff only. Customers never sign themselves up — a portal login
// belongs to a customer record, so it is created for them when a quotation is
// shared.
//
// The request is filed in whichever instance the page passes in, so the whole
// request → approve flow can be tried inside the demo.
export function RequestAccessForm({ mode, onDone }) {
  const { requestAccess } = useAuth();
  const [formError, setFormError] = useState("");
  const [sentMessage, setSentMessage] = useState(null);

  const { register, handleSubmit, reset, formState } = useForm({
    defaultValues: { name: "", email: "", password: "", requestedRole: ROLES.SALES_REP },
  });

  async function onSubmit(values) {
    setFormError("");
    try {
      const result = await requestAccess({ ...values, mode });
      setSentMessage(result.message);
      reset();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  if (sentMessage) {
    return (
      <div>
        <div className="flex gap-3 rounded-lg border border-state-okBorder bg-state-okSoft p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-state-ok" aria-hidden="true" />
          <div>
            <p className="text-base font-medium text-state-ok">Request submitted</p>
            <p className="mt-1 text-sm text-sand-700">{sentMessage}</p>
          </div>
        </div>
        <Button variant="secondary" className="mt-4 w-full" onClick={onDone}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Full name" htmlFor="name" error={formState.errors.name?.message}>
        <Input
          id="name"
          type="text"
          autoComplete="name"
          hasError={Boolean(formState.errors.name)}
          {...register("name", {
            required: "Enter your name",
            minLength: { value: 2, message: "Name is too short" },
          })}
        />
      </Field>

      <Field label="Email" htmlFor="request-email" error={formState.errors.email?.message}>
        <Input
          id="request-email"
          type="email"
          autoComplete="username"
          hasError={Boolean(formState.errors.email)}
          {...register("email", { required: "Enter your email address" })}
        />
      </Field>

      <Field label="Password" htmlFor="request-password" error={formState.errors.password?.message}>
        <Input
          id="request-password"
          type="password"
          autoComplete="new-password"
          hasError={Boolean(formState.errors.password)}
          {...register("password", {
            required: "Choose a password",
            minLength: { value: 8, message: "Password must be at least 8 characters" },
          })}
        />
      </Field>

      <Field
        label="Role you need"
        htmlFor="requestedRole"
        hint="This is only what you are asking for. The admin decides the role you get."
      >
        <Select id="requestedRole" {...register("requestedRole")}>
          {REQUESTABLE_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
      </Field>

      {formError && (
        <p className="rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2 text-sm text-state-bad">
          {formError}
        </p>
      )}

      <Button type="submit" className="w-full" isLoading={formState.isSubmitting}>
        Submit request
      </Button>

      <Button variant="ghost" className="w-full" onClick={onDone}>
        Back to sign in
      </Button>
    </form>
  );
}
