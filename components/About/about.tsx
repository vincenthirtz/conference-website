/* eslint-disable react/no-unescaped-entities */
import React, { JSX } from 'react';
import Heading from '../Typography/heading';
import Paragraph from '../Typography/paragraph';
import Button from '../Buttons/button';
import Image from 'next/image';

function About(): JSX.Element {
  return (
    <div
      className="p-24 lg:pt-8 container flex items-center justify-center w-full"
      data-test="about-section"
    >
      <div className="w-[1120px] lg:w-full flex lg:flex-col-reverse items-center justify-between">
        <div className="lg:mt-16 bg-[url('/img/fourplayers.png')]  bg-left bg-cover w-[450px] h-[550px] sm:w-[100%] sm:h-[500px] rounded-[30px]"></div>
        <div className="w-[600px] ml-10 lg:ml-0 lg:w-full lg:text-center">
          <div className="flex items-center lg:justify-center">
            <div className="text-lg sm:text-sm text-white font-semi-bold border-b-2 border-blue-400 mb-1">
              A propos du tournoi
            </div>
          </div>
          <Heading typeStyle="heading-md" className="text-gradient lg:mt-10">
            OW WOMEN'S CUP
          </Heading>
          <Paragraph
            typeStyle="body-lg"
            className="mt-6"
            textColor="text-gray-200"
          >
         Le but étant de promouvoir l’esport féminin et français à travers une compétition 100% féminine. Le cast sera aussi composé uniquement de femmes.
Évidemment il ne faut pas aller trop vite et il faut faire en fonction du nombre de participantes et du nombre d’équipe qui en découle.
          </Paragraph>
          <Paragraph
            typeStyle="body-lg"
            className="mt-6"
            textColor="text-gray-200"
          >
           Nous sommes à le recherche d'un premier sponsor officiel
          </Paragraph>
          <div
            className="mt-10 flex gap-4 sm:flex-col lg:justify-center"
            data-test="prospectus-download"
          >
            <a
              className="flex justify-center"
              href="https://discord.gg/gERSsjC3Vd"
              target="_blank"
              rel="noreferrer"
            >
              <Button type="button" className="w-[200px]">
                Devenir sponsor
              </Button>
            </a>
            <a
              className="flex justify-center "
              href="/pdf/conf-2025.pdf"
              download={`conf ${new Date().getFullYear()}.pdf`}
            >
              {/* <Button type="button" overlay={true} className="w-[240px] border">
                <div className="flex gap-2 justify-center items-center">
                  <Image
                    src="/img/Download_icon.png"
                    height={20}
                    width={20}
                    alt="Download-icon"
                    objectFit="contain"
                  />
                  <div>Sponsorship prospectus</div>
                </div>
              </Button> */}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default About;
