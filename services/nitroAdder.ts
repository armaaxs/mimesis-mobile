type NitroAdderModule = {
  ReactNativeAdder: {
    sum(num1: number, num2: number): number;
  };
};

let cachedAdder: NitroAdderModule['ReactNativeAdder'] | null | undefined;

const getNitroAdder = () => {
  if (cachedAdder !== undefined) {
    return cachedAdder;
  }

  try {
    const module = require('react-native-react-native-adder') as NitroAdderModule;
    cachedAdder = module.ReactNativeAdder;
  } catch {
    cachedAdder = null;
  }

  return cachedAdder;
};

export const isNitroAdderAvailable = () => {
  const adder = getNitroAdder();
  return typeof adder?.sum === 'function';
};

export const addWithNitro = (left: number, right: number) => {
  const adder = getNitroAdder();

  if (!adder) {
    return left + right;
  }

  return adder.sum(left, right);
};
