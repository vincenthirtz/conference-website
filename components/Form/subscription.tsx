import React, { JSX } from 'react';
import Button from '../Buttons/button';
import { useT } from '@/lib/i18n/useT';
import nsSubscriptionForm from '@/lib/i18n/locales/fr/subscriptionForm';

function Subscription(): JSX.Element {
  const t = useT(nsSubscriptionForm);
  return (
    <div className="mt-0 md:mt-[106px] subscription w-full">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 py-12 sm:px-6">
        <h3 className="text-center text-3xl font-semibold text-white sm:text-[32px]">
          {t.title}
        </h3>
        <a
          href="https://discord.gg/gERSsjC3Vd"
          target="_blank"
          rel="noreferrer"
          className="w-full sm:w-auto"
          data-test="subscribe-button"
        >
          <Button
            type="submit"
            className="mt-8 w-full justify-center px-10 sm:w-[220px]"
          >
            {t.joinBtn}
          </Button>
        </a>
      </div>
    </div>
  );
}

export default Subscription;
