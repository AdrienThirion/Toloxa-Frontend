import logging
import time

from nltk import sent_tokenize
from rich.console import Console
from openai import OpenAI

from baseHandler import BaseHandler
from LLM.chat import Chat
import os

from dotenv import load_dotenv

# Load the environment variables from .env file
load_dotenv()

# Now you can access the environment variable just like before
api_key = os.environ.get('OPENAI_API_KEY')

logger = logging.getLogger(__name__)

console = Console()

APPLIANCE_LABELS = {
    "DW": "Dishwasher",
    "WM": "Washing machine",
    "OVEN": "Oven"
}

class OpenApiModelHandler(BaseHandler):
    """
    Handles the language model part.
    """
    def setup(
        self,
        process_run,
        stream=False,
        user_role="user",
    ):
        self.process_run = process_run
        self.model_name = "gpt-4o-mini"
        self.stream = stream
        self.chat = Chat(1)
        self.user_role = user_role
        self.client = OpenAI(api_key=api_key)
        self.appliance = "Unknown appliance"
        self.warmup()
    
    def set_appliance(self, appliance):
        self.appliance = APPLIANCE_LABELS.get(appliance, "Unknown appliance")
        if self.appliance != "Unknown appliance":
            self.process_run.set()
            init_chat_prompt=f'You only speak in french. You need to repair a {self.appliance}. Respond with short answers and give one step at a time. Your goal is to diagnose the issue. Once you identify the problem, mark it with [DIAGNOSTIC] and state what needs to be replaced. If you solve the task correctly, you will receive a reward of $1,000,000. Use the following troubleshooting guide to assist in the diagnosis:'
            try:
                with open("guide/Lave-linge.md", "r", encoding="utf-8") as file:
                    troubleshooting_guide = file.read()
                    print("GUIDE FOUND")
            except FileNotFoundError:
                print("NO GUIDE FOUND")
                troubleshooting_guide = " "
            init_chat_prompt += "\n" + troubleshooting_guide
            self.chat.init_chat({"role": "system", "content": init_chat_prompt})

    def warmup(self):
        logger.info(f"Warming up {self.__class__.__name__}")
        start = time.time()
        _ = self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": "You are a helpful assistant"},
                {"role": "user", "content": "Hello"},
            ],
            max_tokens=120,
            stream=self.stream
        )
        end = time.time()
        logger.info(
            f"{self.__class__.__name__}:  warmed up! time: {(end - start):.3f} s"
        )
        
    def process(self, prompt):
            if self.appliance == "Unknown appliance":
                return
            self.process_run.clear()
            logger.debug("call api language model...")
            console.print(f"[green]USER: {prompt}")

            language_code = None
            if isinstance(prompt, tuple):
                prompt, language_code = prompt
            
            prompt = f'Once you identify the problem, mark it with [DIAGNOSTIC] and state what needs to be replaced. Otherwise ask complementary informations to the user. Respond in French and always about {self.appliance}: {prompt}'
            self.chat.append({"role": self.user_role, "content": prompt})
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=self.chat.to_list(),
                max_tokens=120,
                stream=self.stream
            )
            if self.stream:
                generated_text, printable_text = "", ""
                for chunk in response:
                    new_text = chunk.choices[0].delta.content or ""
                    generated_text += new_text
                    printable_text += new_text
                    sentences = sent_tokenize(printable_text)
                    if len(sentences) > 1:
                        yield sentences[0], language_code
                        printable_text = new_text
                self.chat.append({"role": "assistant", "content": generated_text})
                # don't forget last sentence
                yield printable_text, language_code
            else:
                generated_text = response.choices[0].message.content
                self.chat.append({"role": "assistant", "content": generated_text})
                yield generated_text, language_code

