import PropTypes from 'prop-types';

export const InputField = ({ setValue, ...props }) => {
  return (
    <input
      {...props}
      onChange={(e) => {
        if (props.type === 'number') {
          setValue(Number(e.target.value));
        } else {
          setValue(e.target.value);
        }
      }}
      className={
        'h-13 w-full rounded-xl border border-slate-600 bg-slate-900/85 px-4 text-base text-white placeholder:text-slate-400 shadow-sm transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30'
      }
    ></input>
  );
};

InputField.propTypes = {
  setValue: PropTypes.func.isRequired,
  type: PropTypes.string,
};
