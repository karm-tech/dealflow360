import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useAuth } from "../../app/AuthProvider";
import { errorMessage } from "../../lib/api";
import { Button, Field, Input } from "../../components/ui";
import { ROLES } from "../../lib/constants";

// Shared by both sign-in pages; the instance is passed in, never picked here.
// Whichever page was used is stamped into the signed token.
export function SignInForm({ mode, footer }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState("");

  const { register, handleSubmit, formState } = useForm({
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values) {
    setFormError("");
    try {
      const user = await login(values.email, values.password, mode);
      navigate(user.role === ROLES.CUSTOMER ? "/portal" : "/quotations", { replace: true });
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          hasError={Boolean(formState.errors.email)}
          {...register("email", { required: "Enter your email address" })}
        />
      </Field>

      <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          hasError={Boolean(formState.errors.password)}
          {...register("password", { required: "Enter your password" })}
        />
      </Field>

      {formError && (
        <div className="rounded-lg border border-state-badBorder bg-state-badSoft px-3 py-2">
          <p className="text-sm text-state-bad">{formError}</p>
          {/* Unconditional: checking whether the address exists elsewhere would
              reveal which accounts are real. */}
          {footer}
        </div>
      )}

      <Button type="submit" className="w-full" isLoading={formState.isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}
